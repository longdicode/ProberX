package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const accessWhitelistFile = "access.json"

// accessMu serialises firewall mutations so that the reconciler and API writes
// can never interleave a clear/apply sequence.
var accessMu sync.Mutex

// normalizeAppName validates and normalizes a deployed app name.
func normalizeAppName(appName string) (string, error) {
	name := strings.TrimSpace(strings.ToLower(appName))
	if name == "" || len(name) > 40 || !validName.MatchString(name) {
		return "", fmt.Errorf("invalid app name")
	}
	return name, nil
}

func appDir(name string) string {
	return filepath.Join(appsDir, name)
}

func loadSources(dir string) []string {
	data, err := os.ReadFile(filepath.Join(dir, accessWhitelistFile))
	if err != nil {
		return nil
	}
	var payload struct {
		Sources []string `json:"sources"`
	}
	if json.Unmarshal(data, &payload) != nil {
		return nil
	}
	var out []string
	for _, s := range payload.Sources {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func storeSources(dir string, sources []string) error {
	payload := struct {
		Sources []string `json:"sources"`
	}{Sources: sources}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, accessWhitelistFile), data, 0644)
}

func iptablesTag(appName string) string {
	return "proberx-wl:" + appName
}

func runIptables(ctx context.Context, args ...string) error {
	cmd := exec.CommandContext(ctx, "iptables", append([]string{"-w"}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("iptables %s: %v: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

// clearAppRules removes every iptables rule tagged for this app. Failures are
// returned to the caller: swallowing them would leave stale rules behind and
// hide a broken firewall from the operator.
func clearAppRules(ctx context.Context, appName string) error {
	cmd := exec.CommandContext(ctx, "iptables", "-w", "-L", "DOCKER-USER", "-n", "--line-numbers")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("iptables -L DOCKER-USER: %v: %s", err, strings.TrimSpace(string(out)))
	}
	tag := iptablesTag(appName)
	var numbers []int
	for _, line := range strings.Split(string(out), "\n") {
		if !strings.Contains(line, tag) {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) > 0 {
			if n, err := strconv.Atoi(fields[0]); err == nil {
				numbers = append(numbers, n)
			}
		}
	}
	for i := len(numbers) - 1; i >= 0; i-- {
		if err := runIptables(ctx, "-D", "DOCKER-USER", strconv.Itoa(numbers[i])); err != nil {
			return err
		}
	}
	return nil
}

func validSource(source string) bool {
	if net.ParseIP(source) != nil {
		return true
	}
	_, _, err := net.ParseCIDR(source)
	return err == nil
}

// applyAppRules enforces the whitelist for the app's published ports in the
// DOCKER-USER chain (consulted before Docker's own FORWARD rules).
//
// Rule order matters: the source ACCEPTs and the RELATED,ESTABLISHED ACCEPT
// must sit above the DROP, and the DROP must only match NEW connections.
// Otherwise the reply packets - whose source is the container, not the allowed
// client - are dropped as well and no client can complete a handshake.
func applyAppRules(ctx context.Context, appName string, ports, sources []string) error {
	if err := clearAppRules(ctx, appName); err != nil {
		return err
	}
	if len(sources) == 0 {
		return nil
	}
	tag := iptablesTag(appName)
	for _, port := range ports {
		drop := []string{"-I", "DOCKER-USER", "-p", "tcp", "-m", "conntrack", "--ctorigdstport", port,
			"--ctstate", "NEW", "-j", "DROP", "-m", "comment", "--comment", tag}
		if err := runIptables(ctx, drop...); err != nil {
			return err
		}
		established := []string{"-I", "DOCKER-USER", "-p", "tcp", "-m", "conntrack", "--ctorigdstport", port,
			"--ctstate", "ESTABLISHED,RELATED", "-j", "ACCEPT", "-m", "comment", "--comment", tag}
		if err := runIptables(ctx, established...); err != nil {
			return err
		}
		for _, source := range sources {
			accept := []string{"-I", "DOCKER-USER", "-p", "tcp", "-m", "conntrack", "--ctorigdstport", port,
				"-s", source, "-j", "ACCEPT", "-m", "comment", "--comment", tag}
			if err := runIptables(ctx, accept...); err != nil {
				return err
			}
		}
	}
	return nil
}

// applyDenyAll drops every external source for the given host ports (the
// secure default for apps that require an access whitelist).
func applyDenyAll(ctx context.Context, appName string, ports []string) error {
	if err := clearAppRules(ctx, appName); err != nil {
		return err
	}
	if len(ports) == 0 {
		return nil
	}
	tag := iptablesTag(appName)
	for _, port := range ports {
		drop := []string{"-I", "DOCKER-USER", "-p", "tcp", "-m", "conntrack", "--ctorigdstport", port,
			"-j", "DROP", "-m", "comment", "--comment", tag}
		if err := runIptables(ctx, drop...); err != nil {
			return err
		}
	}
	return nil
}

func metaFlag(dir, key string) bool {
	data, err := os.ReadFile(filepath.Join(dir, ".proberx_meta"))
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.TrimSpace(line) == key+"=1" {
			return true
		}
	}
	return false
}

// whitelistRequired reports whether an app must always have an explicit
// whitelist (it carries secrets such as API keys).
func whitelistRequired(dir string) bool {
	if metaFlag(dir, "whitelist_required") {
		return true
	}
	data, err := os.ReadFile(filepath.Join(dir, "docker-compose.yml"))
	if err != nil {
		return false
	}
	return strings.Contains(string(data), "deepseek-harness")
}

// enforcementAction is the firewall state an app should be in.
type enforcementAction int

const (
	// enforceClear removes every rule: the app is open and has no whitelist.
	enforceClear enforcementAction = iota
	// enforceRules keeps the app reachable only from the whitelisted sources.
	enforceRules
	// enforceDenyAll blocks every external source.
	enforceDenyAll
)

// resolveEnforcement maps the stored whitelist state to the firewall state.
func resolveEnforcement(sources []string, required bool) enforcementAction {
	if len(sources) > 0 {
		return enforceRules
	}
	if required {
		return enforceDenyAll
	}
	return enforceClear
}

// enforceWhitelistState brings the firewall rules of one app in line with the
// whitelist stored on disk. It is the single entry point shared by deploy,
// API writes and the start-up reconciler.
func enforceWhitelistState(appName, dir string) error {
	sources := loadSources(dir)
	action := resolveEnforcement(sources, whitelistRequired(dir))

	var ports []string
	if action != enforceClear {
		var err error
		ports, err = PublishedHostPorts(dir)
		if err != nil {
			return fmt.Errorf("cannot determine published ports: %w", err)
		}
		if len(ports) == 0 {
			return fmt.Errorf("app %q publishes no host port to protect", appName)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	accessMu.Lock()
	defer accessMu.Unlock()

	switch action {
	case enforceRules:
		return applyAppRules(ctx, appName, ports, sources)
	case enforceDenyAll:
		return applyDenyAll(ctx, appName, ports)
	default:
		return clearAppRules(ctx, appName)
	}
}

// GetAccessWhitelist returns the access whitelist state of a deployed app.
func GetAccessWhitelist(appName string) (AccessWhitelistInfo, error) {
	name, err := normalizeAppName(appName)
	if err != nil {
		return AccessWhitelistInfo{}, fmt.Errorf("invalid app name")
	}
	dir := appDir(name)
	if _, err := os.Stat(filepath.Join(dir, "docker-compose.yml")); err != nil {
		return AccessWhitelistInfo{}, fmt.Errorf("app %q not found", name)
	}
	ports, err := PublishedHostPorts(dir)
	if err != nil {
		ports = nil
	}
	sources := loadSources(dir)
	return AccessWhitelistInfo{
		AppName:  name,
		Ports:    ports,
		Sources:  sources,
		Enabled:  len(sources) > 0,
		Required: whitelistRequired(dir),
	}, nil
}

// SetAccessWhitelist stores and enforces the whitelist of a deployed app.
// The firewall is updated before the file is written so that a failed rule
// change never gets recorded as a successful one.
func SetAccessWhitelist(req AccessWhitelistRequest) (AccessWhitelistInfo, error) {
	name, err := normalizeAppName(req.AppName)
	if err != nil {
		return AccessWhitelistInfo{}, fmt.Errorf("invalid app name")
	}
	dir := appDir(name)
	if _, err := os.Stat(filepath.Join(dir, "docker-compose.yml")); err != nil {
		return AccessWhitelistInfo{}, fmt.Errorf("app %q not found", name)
	}
	ports, err := PublishedHostPorts(dir)
	if err != nil || len(ports) == 0 {
		return AccessWhitelistInfo{}, fmt.Errorf("app %q has no published ports to protect", name)
	}

	var sources []string
	seen := map[string]bool{}
	for _, s := range req.Sources {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			continue
		}
		if !validSource(s) {
			return AccessWhitelistInfo{}, fmt.Errorf("invalid IP or CIDR: %s", s)
		}
		seen[s] = true
		sources = append(sources, s)
	}

	required := whitelistRequired(dir)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	accessMu.Lock()
	defer accessMu.Unlock()

	if resolveEnforcement(sources, required) == enforceDenyAll {
		if err := applyDenyAll(ctx, name, ports); err != nil {
			return AccessWhitelistInfo{}, err
		}
	} else if err := applyAppRules(ctx, name, ports, sources); err != nil {
		return AccessWhitelistInfo{}, err
	}

	if err := storeSources(dir, sources); err != nil {
		return AccessWhitelistInfo{}, err
	}
	return AccessWhitelistInfo{
		AppName:  name,
		Ports:    ports,
		Sources:  sources,
		Enabled:  len(sources) > 0,
		Required: required,
	}, nil
}

// ClearAccessWhitelist removes firewall rules for a removed app.
func ClearAccessWhitelist(appName string) error {
	name, err := normalizeAppName(appName)
	if err != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	accessMu.Lock()
	defer accessMu.Unlock()
	return clearAppRules(ctx, name)
}
