package tools

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

// FetchLogs retrieves system logs via journalctl or from /var/log/syslog.
func FetchLogs(unit string, lines int, since string) ([]LogEntry, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("log fetching is only supported on Linux")
	}

	if lines <= 0 {
		lines = 100
	}
	if lines > 1000 {
		lines = 1000
	}

	args := []string{"--no-pager", "-n", strconv.Itoa(lines), "-o", "short-iso"}
	if unit != "" {
		args = append(args, "-u", unit)
	}
	if since != "" {
		args = append(args, "--since", since)
	}

	cmd := exec.Command("journalctl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return readSyslog(lines)
	}

	var entries []LogEntry
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		entry := parseLogLine(line)
		entries = append(entries, entry)
	}
	return entries, nil
}

// FetchLogFile reads the last N lines from a specified log file.
func FetchLogFile(path string, lines int) ([]LogEntry, error) {
	if path == "" {
		return nil, fmt.Errorf("log file path is required")
	}
	if lines <= 0 {
		lines = 100
	}
	if lines > 1000 {
		lines = 1000
	}

	cmd := exec.Command("tail", "-n", strconv.Itoa(lines), path)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to read %s: %s", path, string(output))
	}

	var entries []LogEntry
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		entries = append(entries, LogEntry{Message: line})
	}
	return entries, nil
}

func readSyslog(lines int) ([]LogEntry, error) {
	cmd := exec.Command("tail", "-n", strconv.Itoa(lines), "/var/log/syslog")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to read syslog: %s", string(output))
	}

	var entries []LogEntry
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		entries = append(entries, LogEntry{Message: line})
	}
	return entries, nil
}

func parseLogLine(line string) LogEntry {
	entry := LogEntry{Message: line}
	if len(line) >= 25 && line[10] == 'T' {
		entry.Timestamp = line[:25]
		rest := strings.TrimSpace(line[25:])
		parts := strings.SplitN(rest, " ", 3)
		if len(parts) >= 1 {
			entry.Hostname = parts[0]
		}
		if len(parts) >= 2 {
			entry.Unit = strings.TrimRight(parts[1], ":")
			if idx := strings.Index(entry.Unit, "["); idx > 0 {
				entry.Unit = entry.Unit[:idx]
			}
		}
		if len(parts) >= 3 {
			entry.Message = parts[2]
		}
	}
	return entry
}
