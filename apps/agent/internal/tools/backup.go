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

const backupsDir = "/opt/proberx/backups"

func ensureBackupsDir() error {
	return os.MkdirAll(backupsDir, 0755)
}

func checkLinuxOp(operation string) error {
	if runtime.GOOS == "windows" {
		return fmt.Errorf("%s is only supported on Linux", operation)
	}
	return nil
}

func CreateFileBackup(sourcePath, name string) (DeployResult, error) {
	if err := checkLinuxOp("file backup"); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}
	if err := ensureBackupsDir(); err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to create backups dir: %w", err)
	}

	info, err := os.Stat(sourcePath)
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("source path error: %w", err)
	}
	if !info.IsDir() {
		return DeployResult{Success: false}, fmt.Errorf("source path must be a directory")
	}

	safeName := sanitizeName(name)
	timestamp := time.Now().UTC().Format("20060102-150405")
	archiveName := fmt.Sprintf("file-%s-%s.tar.gz", safeName, timestamp)
	archivePath := filepath.Join(backupsDir, archiveName)

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "tar", "-czf", archivePath, "-C", sourcePath, ".")
	out, err := cmd.CombinedOutput()
	if err != nil {
		os.Remove(archivePath)
		return DeployResult{Success: false, Output: string(out)},
			fmt.Errorf("tar failed: %s", string(out))
	}

	return DeployResult{Success: true, AppName: archiveName, Output: fmt.Sprintf("Backup created: %s", archiveName)}, nil
}

func CreateDBBackup(dbType, name string) (DeployResult, error) {
	if err := checkLinuxOp("database backup"); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}
	if err := ensureBackupsDir(); err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to create backups dir: %w", err)
	}

	timestamp := time.Now().UTC().Format("20060102-150405")
	safeName := sanitizeName(name)
	archiveName := fmt.Sprintf("db-%s-%s.sql.gz", safeName, timestamp)
	archivePath := filepath.Join(backupsDir, archiveName)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	dbDir := filepath.Join("/opt/proberx/databases", strings.ToLower(dbType))
	composeProject := fmt.Sprintf("proberx-db-%s", strings.ToLower(dbType))

	var cmd *exec.Cmd
	switch strings.ToLower(dbType) {
	case "mysql":
		password := readDBPasswordFromEnv(dbDir, "MYSQL_ROOT_PASSWORD", "changeme")
		cmd = exec.CommandContext(ctx, "docker", "compose", "-p", composeProject, "exec", "-T", "db",
			"mysqldump", "-uroot", fmt.Sprintf("-p%s", password), "--all-databases")
		cmd.Dir = dbDir
	case "postgresql":
		password := readDBPasswordFromEnv(dbDir, "POSTGRES_PASSWORD", "changeme")
		cmd = exec.CommandContext(ctx, "docker", "compose", "-p", composeProject, "exec", "-T", "db",
			"pg_dumpall", "-U", "postgres")
		cmd.Env = append(os.Environ(), fmt.Sprintf("PGPASSWORD=%s", password))
		cmd.Dir = dbDir
	default:
		return DeployResult{Success: false}, fmt.Errorf("unsupported database type for backup: %s", dbType)
	}

	out, err := cmd.CombinedOutput()
	if err != nil {
		return DeployResult{Success: false, Output: string(out)},
			fmt.Errorf("dump failed: %s", string(out))
	}

	// Gzip the output
	gzipCtx, gzipCancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer gzipCancel()

	gzipCmd := exec.CommandContext(gzipCtx, "gzip", "-c")
	gzipCmd.Stdin = strings.NewReader(string(out))
	gzipOut, err := gzipCmd.CombinedOutput()
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("gzip failed: %s", string(gzipOut))
	}

	if err := os.WriteFile(archivePath, gzipOut, 0644); err != nil {
		return DeployResult{Success: false}, fmt.Errorf("write backup failed: %w", err)
	}

	return DeployResult{Success: true, AppName: archiveName, Output: fmt.Sprintf("Backup created: %s", archiveName)}, nil
}

func readDBPasswordFromEnv(dbDir, envKey, fallback string) string {
	envPath := filepath.Join(dbDir, ".env")
	data, err := os.ReadFile(envPath)
	if err != nil {
		return fallback
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, envKey+"=") {
			return strings.TrimPrefix(line, envKey+"=")
		}
	}
	return fallback
}

func ListBackups() ([]BackupInfo, error) {
	if err := ensureBackupsDir(); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(backupsDir)
	if err != nil {
		return nil, err
	}

	var result []BackupInfo
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}

		backupType := "file"
		if strings.HasPrefix(e.Name(), "db-") {
			backupType = "db"
		}

		result = append(result, BackupInfo{
			Name:      e.Name(),
			Type:      backupType,
			Size:      info.Size(),
			CreatedAt: info.ModTime().UTC().Format(time.RFC3339),
		})
	}

	return result, nil
}

func DeleteBackup(name string) error {
	if err := checkLinuxOp("delete backup"); err != nil {
		return err
	}
	cleanName := filepath.Base(name)
	if cleanName != name || strings.Contains(name, "..") {
		return fmt.Errorf("invalid backup name")
	}
	path := filepath.Join(backupsDir, cleanName)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return fmt.Errorf("backup not found: %s", name)
	}
	return os.Remove(path)
}

func RestoreBackup(name string) (DeployResult, error) {
	if err := checkLinuxOp("restore backup"); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}

	cleanName := filepath.Base(name)
	if cleanName != name || strings.Contains(name, "..") {
		return DeployResult{Success: false}, fmt.Errorf("invalid backup name")
	}

	archivePath := filepath.Join(backupsDir, cleanName)
	if _, err := os.Stat(archivePath); os.IsNotExist(err) {
		return DeployResult{Success: false}, fmt.Errorf("backup not found: %s", name)
	}

	if strings.HasPrefix(cleanName, "file-") && strings.HasSuffix(cleanName, ".tar.gz") {
		restoreDir := "/opt/proberx/restore/" + strings.TrimSuffix(cleanName, ".tar.gz")
		if err := os.MkdirAll(restoreDir, 0755); err != nil {
			return DeployResult{Success: false}, fmt.Errorf("failed to create restore dir: %w", err)
		}

		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "tar", "-xzf", archivePath, "-C", restoreDir)
		out, err := cmd.CombinedOutput()
		if err != nil {
			return DeployResult{Success: false, Output: string(out)},
				fmt.Errorf("restore failed: %s", string(out))
		}

		return DeployResult{Success: true, AppName: cleanName, Output: fmt.Sprintf("Restored to %s", restoreDir)}, nil
	}

	return DeployResult{Success: false}, fmt.Errorf("only .tar.gz file backups can be restored")
}

func sanitizeName(name string) string {
	return strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, name)
}
