package tools

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// ListServices returns all systemd service units.
func ListServices() ([]ServiceUnit, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("systemd is only available on Linux")
	}

	cmd := exec.Command("systemctl", "list-units", "--type=service", "--all", "--no-legend", "--no-pager")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("systemctl failed: %s", string(output))
	}

	var units []ServiceUnit
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		units = append(units, ServiceUnit{
			Name:        fields[0],
			LoadState:   fields[1],
			ActiveState: fields[2],
			SubState:    fields[3],
			Description: strings.Join(fields[4:], " "),
		})
	}
	return units, nil
}

// ControlService performs start/stop/restart/reload on a systemd service.
func ControlService(name, action string) (map[string]string, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("systemd is only available on Linux")
	}

	validActions := map[string]bool{"start": true, "stop": true, "restart": true, "reload": true, "enable": true, "disable": true}
	if !validActions[action] {
		return nil, fmt.Errorf("invalid action: %s (use start, stop, restart, reload, enable, disable)", action)
	}

	cmd := exec.Command("systemctl", action, name)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("systemctl %s %s failed: %s", action, name, string(output))
	}

	return map[string]string{
		"service": name,
		"action":  action,
		"status":  "ok",
		"output":  strings.TrimSpace(string(output)),
	}, nil
}

// ServiceStatus returns detailed status for a specific service.
func ServiceStatus(name string) (map[string]string, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("systemd is only available on Linux")
	}

	cmd := exec.Command("systemctl", "status", name, "--no-pager", "-l")
	output, _ := cmd.CombinedOutput()
	return map[string]string{
		"service": name,
		"output":  strings.TrimSpace(string(output)),
	}, nil
}
