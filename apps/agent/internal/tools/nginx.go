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

// ListVHosts returns all virtual hosts from sites-available.
func ListVHosts() ([]VHostInfo, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("nginx management is only supported on Linux")
	}

	var result []VHostInfo
	availDir := "/etc/nginx/sites-available"
	enabledDir := "/etc/nginx/sites-enabled"

	entries, err := os.ReadDir(availDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read %s: %v", availDir, err)
	}

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		domain := e.Name()
		configPath := availDir + "/" + domain
		data, err := os.ReadFile(configPath)
		if err != nil {
			continue
		}
		content := string(data)

		info := VHostInfo{
			Domain:     domain,
			ConfigPath: configPath,
			Enabled:    false,
			HasSSL:     strings.Contains(content, "ssl_certificate") || strings.Contains(content, "listen 443"),
		}

		if _, err := os.Stat(enabledDir + "/" + domain); err == nil {
			info.Enabled = true
		}

		for _, line := range strings.Split(content, "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "proxy_pass") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					target := strings.TrimRight(fields[1], ";")
					info.TargetPort = target
				}
			}
		}

		result = append(result, info)
	}

	return result, nil
}

// CreateVHost writes an nginx config and enables the site.
func CreateVHost(req CreateVHostRequest) (*VHostInfo, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("nginx management is only supported on Linux")
	}

	domain := strings.TrimSpace(req.Domain)
	targetPort := strings.TrimSpace(req.TargetPort)
	webRoot := strings.TrimSpace(req.WebRoot)

	if domain == "" || targetPort == "" {
		return nil, fmt.Errorf("domain and target_port are required")
	}

	availDir := "/etc/nginx/sites-available"
	enabledDir := "/etc/nginx/sites-enabled"

	if err := os.MkdirAll(availDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create %s: %v", availDir, err)
	}
	if err := os.MkdirAll(enabledDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create %s: %v", enabledDir, err)
	}

	if webRoot == "" {
		webRoot = "/var/www/" + domain
	}
	os.MkdirAll(webRoot, 0755)

	var config strings.Builder
	config.WriteString(fmt.Sprintf("# ProberX VHost: %s\n", domain))
	config.WriteString("server {\n")
	config.WriteString(fmt.Sprintf("    listen 80;\n"))
	config.WriteString(fmt.Sprintf("    server_name %s;\n", domain))
	config.WriteString(fmt.Sprintf("    root %s;\n", webRoot))
	config.WriteString("\n")
	config.WriteString(fmt.Sprintf("    location / {\n        proxy_pass %s;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    }\n", targetPort))
	config.WriteString("}\n")

	configPath := availDir + "/" + domain
	if err := os.WriteFile(configPath, []byte(config.String()), 0644); err != nil {
		return nil, fmt.Errorf("failed to write config: %v", err)
	}

	enabledPath := enabledDir + "/" + domain
	if err := os.Symlink(configPath, enabledPath); err != nil && !os.IsExist(err) {
		return nil, fmt.Errorf("failed to enable site: %v", err)
	}

	cmd := exec.Command("nginx", "-s", "reload")
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("nginx reload failed: %s", string(out))
	}

	return &VHostInfo{
		Domain:     domain,
		ConfigPath: configPath,
		Enabled:    true,
		HasSSL:     false,
		TargetPort: targetPort,
	}, nil
}

// DeleteVHost removes a virtual host config and disables it.
func DeleteVHost(domain string) (map[string]string, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("nginx management is only supported on Linux")
	}

	domain = strings.TrimSpace(domain)
	if domain == "" {
		return nil, fmt.Errorf("domain is required")
	}

	availDir := "/etc/nginx/sites-available"
	enabledDir := "/etc/nginx/sites-enabled"

	enabledPath := enabledDir + "/" + domain
	os.Remove(enabledPath)

	configPath := availDir + "/" + domain
	if err := os.Remove(configPath); err != nil {
		return nil, fmt.Errorf("failed to remove config: %v", err)
	}

	cmd := exec.Command("nginx", "-s", "reload")
	if out, err := cmd.CombinedOutput(); err != nil {
		return map[string]string{"status": "warning", "domain": domain, "output": string(out)}, nil
	}

	return map[string]string{"status": "deleted", "domain": domain}, nil
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
