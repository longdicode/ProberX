package tools

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

// NginxStatusCheck returns nginx installation status and configuration info.
func NginxStatusCheck() (*NginxStatus, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("nginx management is only supported on Linux")
	}

	s := &NginxStatus{}

	nginxPath, err := exec.LookPath("nginx")
	if err != nil {
		s.Installed = false
		return s, nil
	}
	s.Installed = true

	verCmd := exec.Command(nginxPath, "-v")
	verOut, _ := verCmd.CombinedOutput()
	s.Version = strings.TrimSpace(string(verOut))

	statCmd := exec.Command("systemctl", "is-active", "nginx", "--quiet")
	if err := statCmd.Run(); err == nil {
		s.Active = true
	}

	testCmd := exec.Command(nginxPath, "-t")
	testOut, _ := testCmd.CombinedOutput()
	s.ConfigTest = strings.TrimSpace(string(testOut))

	findCmd := exec.Command(nginxPath, "-T")
	findOut, _ := findCmd.CombinedOutput()
	for _, line := range strings.Split(string(findOut), "\n") {
		if strings.HasPrefix(line, "# configuration file") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) > 1 {
				s.ConfigFiles = append(s.ConfigFiles, strings.TrimSpace(parts[1]))
			}
		}
	}
	if len(s.ConfigFiles) == 0 {
		s.ConfigFiles = []string{"/etc/nginx/nginx.conf"}
	}

	vhostDirs := []string{"/etc/nginx/sites-enabled", "/etc/nginx/conf.d"}
	for _, dir := range vhostDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				s.VHosts = append(s.VHosts, dir+"/"+e.Name())
			}
		}
	}

	if data, err := os.ReadFile("/etc/nginx/nginx.conf"); err == nil {
		content := string(data)
		s.AccessLog = extractNginxLogPath(content, "access_log")
		s.ErrorLog = extractNginxLogPath(content, "error_log")
	}

	return s, nil
}

// NginxReload reloads nginx configuration.
func NginxReload() (map[string]string, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("nginx management is only supported on Linux")
	}

	cmd := exec.Command("nginx", "-s", "reload")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("nginx reload failed: %s", string(output))
	}

	return map[string]string{
		"status": "reloaded",
		"output": strings.TrimSpace(string(output)),
	}, nil
}

// NginxConfig returns the main nginx config content.
func NginxConfig(path string) (map[string]string, error) {
	if path == "" {
		path = "/etc/nginx/nginx.conf"
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read %s: %v", path, err)
	}

	return map[string]string{
		"path":    path,
		"content": string(data),
	}, nil
}

func extractNginxLogPath(config, directive string) string {
	for _, line := range strings.Split(config, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, directive) {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				return strings.TrimRight(fields[1], ";")
			}
		}
	}
	return ""
}
