package tools

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const appsDir = "/opt/proberx/apps"

var validName = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`)

var templates = []AppTemplate{
	{
		ID:          "nginx-proxy-manager",
		Name:        "Nginx Proxy Manager",
		Description: "Easy reverse proxy with SSL management",
		Icon:        "globe",
		DefaultEnv:  map[string]string{"PORT_80": "8080", "PORT_443": "8443", "PORT_81": "8181"},
		MemoryLimit: "256m",
		CpuLimit:    "0.5",
	},
	{
		ID:          "wordpress",
		Name:        "WordPress",
		Description: "Most popular CMS with MySQL",
		Icon:        "file-text",
		DefaultEnv:  map[string]string{"PORT": "8080", "DB_PASSWORD": "changeme", "DB_ROOT_PASSWORD": "changeme"},
		MemoryLimit: "512m",
		CpuLimit:    "1.0",
	},
	{
		ID:          "gitea",
		Name:        "Gitea",
		Description: "Lightweight self-hosted Git service",
		Icon:        "git-branch",
		DefaultEnv:  map[string]string{"SSH_PORT": "2222", "WEB_PORT": "3000"},
		MemoryLimit: "1g",
		CpuLimit:    "1.0",
	},
	{
		ID:          "portainer",
		Name:        "Portainer",
		Description: "Docker container management UI",
		Icon:        "server",
		DefaultEnv:  map[string]string{"PORT": "9443"},
		MemoryLimit: "256m",
		CpuLimit:    "0.5",
	},
	{
		ID:          "uptime-kuma",
		Name:        "Uptime Kuma",
		Description: "Self-hosted uptime monitoring",
		Icon:        "activity",
		DefaultEnv:  map[string]string{"PORT": "3001"},
		MemoryLimit: "256m",
		CpuLimit:    "0.5",
	},
	{
		ID:          "plausible",
		Name:        "Plausible Analytics",
		Description: "Privacy-friendly web analytics",
		Icon:        "bar-chart",
		DefaultEnv:  map[string]string{"PORT": "8000", "SECRET_KEY_BASE": "changeme"},
		MemoryLimit: "1g",
		CpuLimit:    "1.0",
	},
	{
		ID:          "nocodb",
		Name:        "NocoDB",
		Description: "Airtable alternative, smart spreadsheet",
		Icon:        "grid",
		DefaultEnv:  map[string]string{"PORT": "8080"},
		MemoryLimit: "512m",
		CpuLimit:    "1.0",
	},
	{
		ID:          "changedetection",
		Name:        "Changedetection",
		Description: "Monitor web page changes",
		Icon:        "refresh-cw",
		DefaultEnv:  map[string]string{"PORT": "5000"},
		MemoryLimit: "256m",
		CpuLimit:    "0.3",
	},
}

var composeTemplates = map[string]string{
	"nginx-proxy-manager": `services:
  app:
    image: jc21/nginx-proxy-manager:latest
    container_name: "${APP_NAME}"
    ports:
      - "${PORT_80}:80"
      - "${PORT_443}:443"
      - "${PORT_81}:81"
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    restart: unless-stopped
`,
	"wordpress": `services:
  db:
    image: mysql:8
    container_name: "${APP_NAME}-db"
    environment:
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: "${DB_PASSWORD}"
      MYSQL_ROOT_PASSWORD: "${DB_ROOT_PASSWORD}"
    volumes:
      - ./db:/var/lib/mysql
    restart: unless-stopped
  app:
    image: wordpress:latest
    container_name: "${APP_NAME}"
    ports:
      - "${PORT}:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: "${DB_PASSWORD}"
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - ./html:/var/www/html
    depends_on:
      - db
    restart: unless-stopped
`,
	"gitea": `services:
  app:
    image: gitea/gitea:latest
    container_name: "${APP_NAME}"
    ports:
      - "${WEB_PORT}:3000"
      - "${SSH_PORT}:22"
    volumes:
      - ./data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped
`,
	"portainer": `services:
  app:
    image: portainer/portainer-ce:latest
    container_name: "${APP_NAME}"
    ports:
      - "${PORT}:9443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
    restart: unless-stopped
`,
	"uptime-kuma": `services:
  app:
    image: louislam/uptime-kuma:latest
    container_name: "${APP_NAME}"
    ports:
      - "${PORT}:3001"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
`,
	"plausible": `services:
  db:
    image: postgres:15-alpine
    container_name: "${APP_NAME}-db"
    environment:
      POSTGRES_DB: plausible
      POSTGRES_USER: plausible
      POSTGRES_PASSWORD: "${SECRET_KEY_BASE}"
    volumes:
      - ./db:/var/lib/postgresql/data
    restart: unless-stopped
  events:
    image: clickhouse/clickhouse-server:23-alpine
    container_name: "${APP_NAME}-events"
    ulimits:
      nofile: 262144
    volumes:
      - ./clickhouse:/var/lib/clickhouse
    restart: unless-stopped
  app:
    image: plausible/analytics:latest
    container_name: "${APP_NAME}"
    ports:
      - "${PORT}:8000"
    environment:
      BASE_URL: http://localhost:${PORT}
      SECRET_KEY_BASE: "${SECRET_KEY_BASE}"
      DATABASE_URL: postgres://plausible:${SECRET_KEY_BASE}@db:5432/plausible
      CLICKHOUSE_URL: http://events:8123/plausible
    depends_on:
      - db
      - events
    restart: unless-stopped
`,
	"nocodb": `services:
  db:
    image: postgres:15-alpine
    container_name: "${APP_NAME}-db"
    environment:
      POSTGRES_DB: nocodb
      POSTGRES_USER: nocodb
      POSTGRES_PASSWORD: changeme
    volumes:
      - ./db:/var/lib/postgresql/data
    restart: unless-stopped
  app:
    image: nocodb/nocodb:latest
    container_name: "${APP_NAME}"
    ports:
      - "${PORT}:8080"
    environment:
      NC_DB: pg://db:5432?u=nocodb&p=changeme&d=nocodb
    depends_on:
      - db
    restart: unless-stopped
`,
	"changedetection": `services:
  app:
    image: ghcr.io/dgtlmoon/changedetection.io:latest
    container_name: "${APP_NAME}"
    ports:
      - "${PORT}:5000"
    volumes:
      - ./data:/datastore
    restart: unless-stopped
`,
}

func checkDocker() error {
	if runtime.GOOS != "linux" {
		return fmt.Errorf("app deployment is only supported on Linux")
	}
	if _, err := exec.LookPath("docker"); err != nil {
		return fmt.Errorf("Docker is not installed on this server")
	}
	out, err := exec.Command("docker", "compose", "version").CombinedOutput()
	if err != nil {
		out2, err2 := exec.Command("docker-compose", "version").CombinedOutput()
		if err2 != nil {
			return fmt.Errorf("Docker Compose is not installed: %s / %s", string(out), string(out2))
		}
	}
	return nil
}

func ListTemplates() []AppTemplate {
	return templates
}

func DeployApp(req DeployRequest) (DeployResult, error) {
	if err := checkDocker(); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}

	appName := strings.TrimSpace(strings.ToLower(req.AppName))
	if appName == "" || len(appName) > 40 || !validName.MatchString(appName) {
		return DeployResult{Success: false, AppName: appName},
			fmt.Errorf("app name must be lowercase alphanumeric with hyphens only (max 40 chars)")
	}

	var yaml string
	isCustom := req.TemplateID == "custom"

	if isCustom {
		yaml = req.Yaml
		if strings.TrimSpace(yaml) == "" {
			return DeployResult{Success: false, AppName: appName},
				fmt.Errorf("docker-compose YAML is required for custom deployments")
		}
	} else {
		var ok bool
		yaml, ok = composeTemplates[strings.TrimSpace(req.TemplateID)]
		if !ok {
			return DeployResult{Success: false, AppName: appName},
				fmt.Errorf("unknown template: %s", req.TemplateID)
		}
	}

	appDir := filepath.Join(appsDir, appName)
	if _, err := os.Stat(appDir); err == nil {
		return DeployResult{Success: false, AppName: appName},
			fmt.Errorf("app %q already exists, remove it first", appName)
	}

	var tmpl AppTemplate
	for _, t := range templates {
		if t.ID == req.TemplateID {
			tmpl = t
			break
		}
	}

	memLimit := req.MemoryLimit
	if memLimit == "" {
		memLimit = tmpl.MemoryLimit
	}
	cpuLimit := req.CpuLimit
	if cpuLimit == "" {
		cpuLimit = tmpl.CpuLimit
	}

	if memLimit != "" || cpuLimit != "" {
		if memLimit == "" {
			memLimit = "0"
		}
		if cpuLimit == "" {
			cpuLimit = "0"
		}
		deployBlock := fmt.Sprintf("\n    deploy:\n      resources:\n        limits:\n          cpus: '%s'\n          memory: %s", cpuLimit, memLimit)
		yaml = strings.ReplaceAll(yaml, "restart: unless-stopped", "restart: unless-stopped"+deployBlock)
	}

	if err := os.MkdirAll(appDir, 0755); err != nil {
		return DeployResult{Success: false, AppName: appName},
			fmt.Errorf("failed to create app directory: %w", err)
	}

	envLines := []string{fmt.Sprintf("APP_NAME=%s", appName)}
	merged := make(map[string]string)
	for k, v := range tmpl.DefaultEnv {
		merged[k] = v
	}
	for k, v := range req.Env {
		merged[k] = v
	}
	for k, v := range merged {
		envLines = append(envLines, fmt.Sprintf("%s=%s", k, v))
	}
	if err := os.WriteFile(filepath.Join(appDir, ".env"), []byte(strings.Join(envLines, "\n")+"\n"), 0644); err != nil {
		os.RemoveAll(appDir)
		return DeployResult{Success: false, AppName: appName},
			fmt.Errorf("failed to write .env: %w", err)
	}

	if err := os.WriteFile(filepath.Join(appDir, "docker-compose.yml"), []byte(yaml), 0644); err != nil {
		os.RemoveAll(appDir)
		return DeployResult{Success: false, AppName: appName},
			fmt.Errorf("failed to write docker-compose.yml: %w", err)
	}

	logPath := filepath.Join(appDir, "deploy.log")
	logFile, err := os.Create(logPath)
	if err != nil {
		os.RemoveAll(appDir)
		return DeployResult{Success: false, AppName: appName},
			fmt.Errorf("failed to create deploy log: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "compose", "-p", appName, "up", "-d")
	cmd.Dir = appDir

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		logFile.Close()
		os.RemoveAll(appDir)
		return DeployResult{Success: false, AppName: appName},
			fmt.Errorf("failed to start deploy: %w", err)
	}

	var output strings.Builder
	multi := io.MultiWriter(&output, logFile)

	go func() { io.Copy(multi, stdout) }()
	go func() { io.Copy(multi, stderr) }()

	cmdErr := cmd.Wait()
	logFile.Close()

	outputStr := output.String()

	if cmdErr != nil {
		return DeployResult{Success: false, AppName: appName, Output: outputStr},
			fmt.Errorf("deploy failed: %s", outputStr)
	}

	tmplID := req.TemplateID
	if isCustom {
		tmplID = "custom"
	}
	meta := fmt.Sprintf("template=%s\ncreated=%s\n", tmplID, time.Now().UTC().Format(time.RFC3339))
	os.WriteFile(filepath.Join(appDir, ".proberx_meta"), []byte(meta), 0644)

	return DeployResult{Success: true, AppName: appName, Output: outputStr}, nil
}

func GetDeployments() ([]DeploymentInfo, error) {
	if err := checkDocker(); err != nil {
		return nil, err
	}

	if err := os.MkdirAll(appsDir, 0755); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(appsDir)
	if err != nil {
		return nil, err
	}

	var result []DeploymentInfo
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		appDir := filepath.Join(appsDir, e.Name())
		if _, err := os.Stat(filepath.Join(appDir, "docker-compose.yml")); os.IsNotExist(err) {
			continue
		}

		info := DeploymentInfo{AppName: e.Name(), Status: "unknown"}

		metaBytes, _ := os.ReadFile(filepath.Join(appDir, ".proberx_meta"))
		for _, line := range strings.Split(string(metaBytes), "\n") {
			if strings.HasPrefix(line, "template=") {
				info.Template = strings.TrimPrefix(line, "template=")
			}
			if strings.HasPrefix(line, "created=") {
				info.CreatedAt = strings.TrimPrefix(line, "created=")
			}
		}

		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		cmd := exec.CommandContext(ctx, "docker", "compose", "-p", e.Name(), "ps", "--format", "json")
		cmd.Dir = appDir
		out, err := cmd.CombinedOutput()
		cancel()
		if err != nil {
			ctx2, cancel2 := context.WithTimeout(context.Background(), 15*time.Second)
			cmd2 := exec.CommandContext(ctx2, "docker-compose", "-p", e.Name(), "ps", "--format", "json")
			cmd2.Dir = appDir
			out, err = cmd2.CombinedOutput()
			cancel2()
			if err != nil {
				info.Status = "error"
				result = append(result, info)
				continue
			}
		}

		var containers []ContainerStatus
		for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			var raw map[string]interface{}
			if err := json.Unmarshal([]byte(line), &raw); err != nil {
				continue
			}
			cs := ContainerStatus{}
			if n, ok := raw["Name"].(string); ok {
				cs.Name = n
			}
			if s, ok := raw["State"].(string); ok {
				cs.State = s
			}
			if s, ok := raw["Status"].(string); ok {
				cs.Status = s
			}
			containers = append(containers, cs)
		}
		info.Containers = containers

		running, exited := 0, 0
		for _, c := range containers {
			if c.State == "running" {
				running++
			} else {
				exited++
			}
		}
		if len(containers) == 0 {
			info.Status = "unknown"
		} else if running == len(containers) {
			info.Status = "running"
		} else if exited == len(containers) {
			info.Status = "stopped"
		} else {
			info.Status = "partial"
		}

		result = append(result, info)
	}

	return result, nil
}

func RemoveDeployment(appName string) (DeployResult, error) {
	appName = strings.TrimSpace(strings.ToLower(appName))
	appDir := filepath.Join(appsDir, appName)

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		return DeployResult{Success: false, AppName: appName},
			fmt.Errorf("app %q not found", appName)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "compose", "-p", appName, "down", "--volumes", "--remove-orphans")
	cmd.Dir = appDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		exec.Command("docker", "compose", "-p", appName, "kill").Run()
		time.Sleep(2 * time.Second)
		cmd2 := exec.Command("docker", "compose", "-p", appName, "down", "--volumes", "--remove-orphans")
		cmd2.Dir = appDir
		out, _ = cmd2.CombinedOutput()
	}

	if rmErr := os.RemoveAll(appDir); rmErr != nil {
		return DeployResult{Success: false, AppName: appName, Output: string(out)},
			fmt.Errorf("remove directory failed: %w", rmErr)
	}

	return DeployResult{Success: true, AppName: appName, Output: string(out)}, nil
}

func GetDeploymentLogs(appName string) (map[string]string, error) {
	appName = strings.TrimSpace(strings.ToLower(appName))
	appDir := filepath.Join(appsDir, appName)

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("app %q not found", appName)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "compose", "-p", appName, "logs", "--tail=100")
	cmd.Dir = appDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return map[string]string{"app_name": appName, "logs": string(out)}, nil
	}

	return map[string]string{"app_name": appName, "logs": string(out)}, nil
}

func StartDeployment(appName string) (DeployResult, error) {
	appName = strings.TrimSpace(strings.ToLower(appName))
	appDir := filepath.Join(appsDir, appName)

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		return DeployResult{Success: false, AppName: appName}, fmt.Errorf("app %q not found", appName)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "compose", "-p", appName, "start")
	cmd.Dir = appDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return DeployResult{Success: false, AppName: appName, Output: string(out)},
			fmt.Errorf("start failed: %s", string(out))
	}

	return DeployResult{Success: true, AppName: appName, Output: string(out)}, nil
}

func StopDeployment(appName string) (DeployResult, error) {
	appName = strings.TrimSpace(strings.ToLower(appName))
	appDir := filepath.Join(appsDir, appName)

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		return DeployResult{Success: false, AppName: appName}, fmt.Errorf("app %q not found", appName)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "compose", "-p", appName, "stop")
	cmd.Dir = appDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return DeployResult{Success: false, AppName: appName, Output: string(out)},
			fmt.Errorf("stop failed: %s", string(out))
	}

	return DeployResult{Success: true, AppName: appName, Output: string(out)}, nil
}

func RestartDeployment(appName string) (DeployResult, error) {
	appName = strings.TrimSpace(strings.ToLower(appName))
	appDir := filepath.Join(appsDir, appName)

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		return DeployResult{Success: false, AppName: appName}, fmt.Errorf("app %q not found", appName)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "compose", "-p", appName, "restart")
	cmd.Dir = appDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return DeployResult{Success: false, AppName: appName, Output: string(out)},
			fmt.Errorf("restart failed: %s", string(out))
	}

	return DeployResult{Success: true, AppName: appName, Output: string(out)}, nil
}

func UpdateDeployment(appName string) (DeployResult, error) {
	appName = strings.TrimSpace(strings.ToLower(appName))
	appDir := filepath.Join(appsDir, appName)

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		return DeployResult{Success: false, AppName: appName}, fmt.Errorf("app %q not found", appName)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	pullCmd := exec.CommandContext(ctx, "docker", "compose", "-p", appName, "pull")
	pullCmd.Dir = appDir
	pullOut, err := pullCmd.CombinedOutput()
	if err != nil {
		return DeployResult{Success: false, AppName: appName, Output: string(pullOut)},
			fmt.Errorf("pull failed: %s", string(pullOut))
	}

	upCmd := exec.CommandContext(ctx, "docker", "compose", "-p", appName, "up", "-d")
	upCmd.Dir = appDir
	upOut, err := upCmd.CombinedOutput()
	if err != nil {
		return DeployResult{Success: false, AppName: appName, Output: string(upOut)},
			fmt.Errorf("update failed: %s", string(upOut))
	}

	return DeployResult{Success: true, AppName: appName, Output: string(pullOut) + "\n" + string(upOut)}, nil
}

func ReadDeployLog(appName string) (string, error) {
	appName = strings.TrimSpace(strings.ToLower(appName))
	logPath := filepath.Join(appsDir, appName, "deploy.log")

	if _, err := os.Stat(logPath); os.IsNotExist(err) {
		return "", nil
	}

	f, err := os.Open(logPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	const maxLines = 200
	scanner := bufio.NewScanner(f)
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
		if len(lines) > maxLines {
			lines = lines[len(lines)-maxLines:]
		}
	}

	return strings.Join(lines, "\n"), nil
}

func CheckPorts(ports []string) (map[string]bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ss", "-tlnp")
	out, err := cmd.CombinedOutput()
	if err != nil {
		out2, err2 := exec.CommandContext(ctx, "netstat", "-tlnp").CombinedOutput()
		if err2 != nil {
			return nil, fmt.Errorf("failed to check ports: %v / %v", err, err2)
		}
		out = out2
	}

	listening := make(map[int]bool)
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		for _, field := range fields {
			if strings.Contains(field, ":") {
				parts := strings.Split(field, ":")
				if len(parts) >= 2 {
					last := parts[len(parts)-1]
					if port, err := strconv.Atoi(last); err == nil {
						listening[port] = true
					}
				}
			}
		}
	}

	result := make(map[string]bool)
	for _, p := range ports {
		port, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil {
			result[p] = false
			continue
		}
		result[p] = listening[port]
	}

	return result, nil
}
