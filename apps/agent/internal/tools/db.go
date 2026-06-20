package tools

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const dbDir = "/opt/proberx/databases"

var dbImages = map[string]map[string]string{
	"mysql":      {"default": "mysql:8.0", "8.0": "mysql:8.0", "5.7": "mysql:5.7"},
	"postgresql": {"default": "postgres:16-alpine", "16": "postgres:16-alpine", "15": "postgres:15-alpine"},
	"redis":      {"default": "redis:7-alpine", "7": "redis:7-alpine", "6": "redis:6-alpine"},
	"mongodb":    {"default": "mongo:7", "7": "mongo:7", "6": "mongo:6"},
}

var dbDefaultPorts = map[string]string{
	"mysql": "3306", "postgresql": "5432", "redis": "6379", "mongodb": "27017",
}

// ListDatabases returns all installed database instances.
func ListDatabases() ([]DatabaseInfo, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("database management is only supported on Linux")
	}

	os.MkdirAll(dbDir, 0755)
	entries, err := os.ReadDir(dbDir)
	if err != nil {
		return nil, err
	}

	var result []DatabaseInfo
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()

		metaBytes, _ := os.ReadFile(filepath.Join(dbDir, name, ".proberx_meta"))
		meta := string(metaBytes)
		dbType := ""
		for _, line := range strings.Split(meta, "\n") {
			if strings.HasPrefix(line, "type=") {
				dbType = strings.TrimPrefix(line, "type=")
			}
		}

		status := "unknown"
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		cmd := exec.CommandContext(ctx, "docker", "inspect", "-f", "{{.State.Status}}", name)
		out, err := cmd.CombinedOutput()
		cancel()
		if err == nil {
			status = strings.TrimSpace(string(out))
		}

		port := ""
		ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
		cmd2 := exec.CommandContext(ctx2, "docker", "port", name)
		out2, _ := cmd2.CombinedOutput()
		cancel2()
		for _, line := range strings.Split(string(out2), "\n") {
			line = strings.TrimSpace(line)
			if strings.Contains(line, ":") {
				parts := strings.Split(line, ":")
				port = parts[len(parts)-1]
				break
			}
		}

		ver := ""
		ctx3, cancel3 := context.WithTimeout(context.Background(), 10*time.Second)
		cmd3 := exec.CommandContext(ctx3, "docker", "inspect", "-f", "{{.Config.Image}}", name)
		out3, _ := cmd3.CombinedOutput()
		cancel3()
		ver = strings.TrimSpace(string(out3))

		result = append(result, DatabaseInfo{
			Name:      name,
			Type:      dbType,
			Version:   ver,
			Port:      port,
			Status:    status,
			Container: name,
		})
	}

	return result, nil
}

// InstallDatabase deploys a database via Docker.
func InstallDatabase(req DatabaseInstallRequest) (*DatabaseInfo, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("database management is only supported on Linux")
	}

	dbType := strings.TrimSpace(strings.ToLower(req.Type))
	version := strings.TrimSpace(req.Version)
	port := strings.TrimSpace(req.Port)
	password := strings.TrimSpace(req.Password)

	validTypes := map[string]bool{"mysql": true, "postgresql": true, "redis": true, "mongodb": true}
	if !validTypes[dbType] {
		return nil, fmt.Errorf("unsupported database type: %s (choose mysql, postgresql, redis, mongodb)", dbType)
	}

	if port == "" {
		port = dbDefaultPorts[dbType]
	}

	imageMap := dbImages[dbType]
	image := imageMap["default"]
	if version != "" {
		if img, ok := imageMap[version]; ok {
			image = img
		}
	}

	containerName := fmt.Sprintf("proberx-%s", dbType)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	checkCmd := exec.CommandContext(ctx, "docker", "inspect", containerName)
	checkErr := checkCmd.Run()
	cancel()
	if checkErr == nil {
		return nil, fmt.Errorf("database %s is already installed", dbType)
	}

	appDir := filepath.Join(dbDir, containerName)
	os.MkdirAll(appDir, 0755)

	var composeYaml string
	switch dbType {
	case "mysql":
		if password == "" {
			password = "rootpassword"
		}
		composeYaml = fmt.Sprintf(`services:
  db:
    image: %s
    container_name: %s
    ports:
      - "%s:3306"
    environment:
      MYSQL_ROOT_PASSWORD: "%s"
    volumes:
      - ./data:/var/lib/mysql
    restart: unless-stopped
`, image, containerName, port, password)
	case "postgresql":
		if password == "" {
			password = "postgres"
		}
		composeYaml = fmt.Sprintf(`services:
  db:
    image: %s
    container_name: %s
    ports:
      - "%s:5432"
    environment:
      POSTGRES_PASSWORD: "%s"
    volumes:
      - ./data:/var/lib/postgresql/data
    restart: unless-stopped
`, image, containerName, port, password)
	case "redis":
		composeYaml = fmt.Sprintf(`services:
  db:
    image: %s
    container_name: %s
    ports:
      - "%s:6379"
    volumes:
      - ./data:/data
    restart: unless-stopped
`, image, containerName, port)
	case "mongodb":
		composeYaml = fmt.Sprintf(`services:
  db:
    image: %s
    container_name: %s
    ports:
      - "%s:27017"
    volumes:
      - ./data:/data/db
    restart: unless-stopped
`, image, containerName, port)
	}

	if err := os.WriteFile(filepath.Join(appDir, "docker-compose.yml"), []byte(composeYaml), 0644); err != nil {
		os.RemoveAll(appDir)
		return nil, fmt.Errorf("failed to write compose file: %w", err)
	}

	meta := fmt.Sprintf("type=%s\ncreated=%s\n", dbType, time.Now().UTC().Format(time.RFC3339))
	os.WriteFile(filepath.Join(appDir, ".proberx_meta"), []byte(meta), 0644)

	ctx2, cancel2 := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel2()
	cmd := exec.CommandContext(ctx2, "docker", "compose", "-p", containerName, "up", "-d")
	cmd.Dir = appDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to start database: %s", string(out))
	}

	return &DatabaseInfo{
		Name:      containerName,
		Type:      dbType,
		Version:   image,
		Port:      port,
		Status:    "running",
		Container: containerName,
	}, nil
}

// RemoveDatabase stops and removes a database container.
func RemoveDatabase(dbType string) (map[string]string, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("database management is only supported on Linux")
	}

	dbType = strings.TrimSpace(strings.ToLower(dbType))
	if dbType == "" {
		return nil, fmt.Errorf("database type is required")
	}

	containerName := fmt.Sprintf("proberx-%s", dbType)
	appDir := filepath.Join(dbDir, containerName)

	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("database %s not found", dbType)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "compose", "-p", containerName, "down", "--volumes", "--remove-orphans")
	cmd.Dir = appDir
	out, err := cmd.CombinedOutput()
	if err != nil {
		exec.Command("docker", "rm", "-f", containerName).Run()
	}

	os.RemoveAll(appDir)

	return map[string]string{
		"status": "removed",
		"type":   dbType,
		"output": string(out),
	}, nil
}
