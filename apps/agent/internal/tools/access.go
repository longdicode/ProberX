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
	"time"
)

const accessWhitelistFile = "access.json"

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

// readDotEnv parses the agent-written .env file into a map.
func readDotEnv(dir string) map[string]string {
	env := map[string]string{}
	data, err := os.ReadFile(filepath.Join(dir, ".env"))
	if err != nil {
		return env
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		kv := strings.SplitN(line, "=", 2)
		if len(kv) == 2 {
			env[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
		}
	}
	return env
}

// resolvePortValue resolves a compose port host field (either a number or an
// env reference such as ${PORT} or $PORT) against the app .env file.
func resolvePortValue(field string, env map[string]string) (string, bool) {
	field = strings.TrimSpace(field)
	if field == "" {
		return "", false
	}
	if strings.HasPrefix(field, "${") && strings.HasSuffix(field, "}") {
		field = strings.TrimSuffix(strings.TrimPrefix(field, "${"), "}")
	}
	if strings.HasPrefix(field, "$") {
		field = strings.TrimPrefix(field, "$")
	}
	if strings.Contains(field, "$") {
		return "", false
	}
	if v, ok := env[field]; ok {
		field = strings.TrimSpace(v)
	}
	if _, err := strconv.Atoi(field); err != nil {
		return "", false
	}
	return field, true
}

// PublishedHostPorts returns the stable host ports published by an app's
// docker-compose.yml (env values resolved from the app .env file).
func PublishedHostPorts(dir string) ([]string, error) {
	data, err := os.ReadFile(filepath.Join(dir, "docker-compose.yml"))
	if err != nil {
		return nil, err
	}
	env := readDotEnv(dir)
	seen := map[string]bool{}
	var ports []string
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "-") {
			continue
		}
		entry := strings.Trim(strings.TrimSpace(strings.TrimPrefix(trimmed, "-")), `"' `)
		if entry == "" {
			continue
		}
		parts := strings.Split(entry, ":")
		if len(parts) == 1 {
			continue // container-only port: host port is random
		}
		hostField := parts[0]
		if len(parts) == 3 {
			hostField = parts[1] // ip:host:container form
		}
		port, ok := resolvePortValue(hostField, env)
		if !ok || seen[port] {
			continue
		}
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			continue
		}
		seen[port] = true
		ports = append(ports, port)
	}
	return ports, nil
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

// clearAppRules removes every iptables rule tagged for this app.
func clearAppRules(appName string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "iptables", "-w", "-L", "DOCKER-USER", "-n", "--line-numbers")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil // docker/iptables not ready: nothing to clear
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
		runIptables(ctx, "-D", "DOCKER-USER", strconv.Itoa(numbers[i]))
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
func applyAppRules(appName string, ports, sources []string) error {
	if err := clearAppRules(appName); err != nil {
		return err
	}
	if len(sources) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	tag := iptablesTag(appName)
	for _, port := range ports {
		drop := []string{"-I", "DOCKER-USER", "-p", "tcp", "-m", "conntrack", "--ctorigdstport", port, "-j", "DROP",
			"-m", "comment", "--comment", tag}
		if err := runIptables(ctx, drop...); err != nil {
			return err
		}
		for _, source := range sources {
			accept := []string{"-I", "DOCKER-USER", "-p", "tcp", "-m", "conntrack", "--ctorigdstport", port, "-s", source,
				"-j", "ACCEPT", "-m", "comment", "--comment", tag}
			if err := runIptables(ctx, accept...); err != nil {
				return err
			}
		}
	}
	return nil
}

// applyDenyAll drops every external source for the given host ports (the
// secure default for apps that require an access whitelist).
func applyDenyAll(appName string, ports []string) error {
	if err := clearAppRules(appName); err != nil {
		return err
	}
	if len(ports) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	tag := iptablesTag(appName)
	for _, port := range ports {
		drop := []string{"-I", "DOCKER-USER", "-p", "tcp", "-m", "conntrack", "--ctorigdstport", port, "-j", "DROP",
			"-m", "comment", "--comment", tag}
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
	if len(sources) == 0 && whitelistRequired(dir) {
		if err := applyDenyAll(name, ports); err != nil {
			return AccessWhitelistInfo{}, err
		}
	} else if err := applyAppRules(name, ports, sources); err != nil {
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
		Required: whitelistRequired(dir),
	}, nil
}

// ClearAccessWhitelist removes firewall rules for a removed app.
func ClearAccessWhitelist(appName string) {
	if name, err := normalizeAppName(appName); err == nil {
		clearAppRules(name)
	}
}
