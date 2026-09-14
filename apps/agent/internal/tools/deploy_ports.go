package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// dockerCmdFunc runs the docker CLI. It is a variable so tests can stub it.
var dockerCmdFunc = func(ctx context.Context, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, "docker", args...).Output()
}

type inspectContainer struct {
	Labels          map[string]string `json:"Labels"`
	NetworkSettings struct {
		Ports map[string][]struct {
			HostIP   string `json:"HostIp"`
			HostPort string `json:"HostPort"`
		} `json:"Ports"`
	} `json:"NetworkSettings"`
}

// DockerPublishedHostPorts returns the host ports actually published by the
// containers of a compose project, as reported by the Docker daemon. This is
// the authoritative source: text parsing of docker-compose.yml misses port
// ranges, host networking and manifests generated elsewhere.
func DockerPublishedHostPorts(project string) ([]string, error) {
	if !validName.MatchString(project) {
		return nil, fmt.Errorf("invalid project name")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	idsOut, err := dockerCmdFunc(ctx, "ps", "-a",
		"--filter", "label=com.docker.compose.project="+project, "--format", "{{.ID}}")
	if err != nil {
		return nil, fmt.Errorf("docker ps: %w", err)
	}
	ids := strings.Fields(string(idsOut))
	if len(ids) == 0 {
		return nil, fmt.Errorf("no containers found for project %q", project)
	}

	inspectOut, err := dockerCmdFunc(ctx, append([]string{"inspect"}, ids...)...)
	if err != nil {
		return nil, fmt.Errorf("docker inspect: %w", err)
	}
	var items []inspectContainer
	if err := json.Unmarshal(inspectOut, &items); err != nil {
		return nil, fmt.Errorf("parse docker inspect output: %w", err)
	}
	return hostPortsFromInspect(items), nil
}

// hostPortsFromInspect extracts the sorted, de-duplicated host ports of the
// given containers.
func hostPortsFromInspect(items []inspectContainer) []string {
	seen := map[string]bool{}
	var ports []string
	for _, c := range items {
		for _, bindings := range c.NetworkSettings.Ports {
			for _, b := range bindings {
				port := strings.TrimSpace(b.HostPort)
				if port == "" || seen[port] {
					continue
				}
				n, err := strconv.Atoi(port)
				if err != nil || n < 1 || n > 65535 {
					continue
				}
				seen[port] = true
				ports = append(ports, port)
			}
		}
	}
	sort.Slice(ports, func(i, j int) bool {
		a, _ := strconv.Atoi(ports[i])
		b, _ := strconv.Atoi(ports[j])
		return a < b
	})
	return ports
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

// ComposePublishedHostPorts parses docker-compose.yml and resolves the
// published host ports from the app .env file. Used as a fallback when the
// containers are not (yet) visible to the Docker daemon.
func ComposePublishedHostPorts(dir string) ([]string, error) {
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
		entry := strings.Trim(strings.TrimSpace(strings.TrimPrefix(trimmed, "-")), "\"' ")
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

// PublishedHostPorts returns the host ports of an app: the real Docker port
// mappings when they can be read, otherwise the values declared in
// docker-compose.yml.
func PublishedHostPorts(dir string) ([]string, error) {
	if ports, err := DockerPublishedHostPorts(filepath.Base(dir)); err == nil && len(ports) > 0 {
		return ports, nil
	}
	return ComposePublishedHostPorts(dir)
}
