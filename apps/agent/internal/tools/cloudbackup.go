package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

const cloudConfigPath = "/opt/proberx/cloud-backup.json"

func loadCloudConfig() (CloudBackupConfig, error) {
	var cfg CloudBackupConfig
	data, err := os.ReadFile(cloudConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, fmt.Errorf("failed to read cloud config: %w", err)
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("failed to parse cloud config: %w", err)
	}
	return cfg, nil
}

func saveCloudConfig(cfg CloudBackupConfig) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal cloud config: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(cloudConfigPath), 0755); err != nil {
		return fmt.Errorf("failed to create config dir: %w", err)
	}
	if err := os.WriteFile(cloudConfigPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write cloud config: %w", err)
	}
	return nil
}

// LoadCloudConfigPublic returns the cloud config with secret_key masked for display.
func LoadCloudConfigPublic() (CloudBackupConfig, error) {
	cfg, err := loadCloudConfig()
	if err != nil {
		return cfg, err
	}
	if len(cfg.SecretKey) > 4 {
		cfg.SecretKey = cfg.SecretKey[:4] + strings.Repeat("*", len(cfg.SecretKey)-4)
	} else if cfg.SecretKey != "" {
		cfg.SecretKey = strings.Repeat("*", len(cfg.SecretKey))
	}
	return cfg, nil
}

// SaveCloudConfigInternal saves the cloud backup config.
func SaveCloudConfigInternal(cfg CloudBackupConfig) error {
	if cfg.Provider == "" {
		return fmt.Errorf("provider is required")
	}
	if cfg.Endpoint == "" {
		return fmt.Errorf("endpoint is required")
	}
	if cfg.Bucket == "" {
		return fmt.Errorf("bucket is required")
	}
	if cfg.AccessKey == "" {
		return fmt.Errorf("access_key is required")
	}
	if cfg.SecretKey == "" {
		return fmt.Errorf("secret_key is required")
	}
	return saveCloudConfig(cfg)
}

// LoadCloudConfigInternal returns the full cloud backup config (secrets unmasked).
func LoadCloudConfigInternal() (CloudBackupConfig, error) {
	return loadCloudConfig()
}

func newS3Client(cfg CloudBackupConfig) (*s3.Client, error) {
	creds := credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, "")
	awsCfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithCredentialsProvider(creds),
		config.WithRegion(cfg.Region),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = true
	})
	return client, nil
}

// objectExists checks if a given key exists in the S3 bucket.
func objectExists(ctx context.Context, client *s3.Client, bucket, key string) (bool, error) {
	_, err := client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		var nf *types.NotFound
		if errors.As(err, &nf) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// UploadToCloud uploads a local backup file to cloud storage.
func UploadToCloud(name string) (DeployResult, error) {
	if err := checkLinuxOp("cloud upload"); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}

	cfg, err := loadCloudConfig()
	if err != nil {
		return DeployResult{Success: false}, err
	}
	if cfg.Bucket == "" {
		return DeployResult{Success: false}, fmt.Errorf("cloud not configured: bucket is empty")
	}

	client, err := newS3Client(cfg)
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to create S3 client: %w", err)
	}

	cleanName := filepath.Base(name)
	if cleanName != name || strings.Contains(name, "..") {
		return DeployResult{Success: false}, fmt.Errorf("invalid backup name")
	}

	// Check if already exists in cloud
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	exists, err := objectExists(ctx, client, cfg.Bucket, cleanName)
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to check cloud object: %w", err)
	}
	if exists {
		return DeployResult{
			Success: true,
			AppName: cleanName,
			Output:  fmt.Sprintf("Already exists in cloud: %s", cleanName),
		}, nil
	}

	localPath := filepath.Join(backupsDir, cleanName)
	file, err := os.Open(localPath)
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to open local backup: %w", err)
	}
	defer file.Close()

	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(cfg.Bucket),
		Key:    aws.String(cleanName),
		Body:   file,
	})
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("upload failed: %w", err)
	}

	return DeployResult{
		Success: true,
		AppName: cleanName,
		Output:  fmt.Sprintf("Uploaded %s to cloud bucket %s", cleanName, cfg.Bucket),
	}, nil
}

// DownloadFromCloud downloads a backup from cloud storage to local backups.
func DownloadFromCloud(name string) (DeployResult, error) {
	if err := checkLinuxOp("cloud download"); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}

	cfg, err := loadCloudConfig()
	if err != nil {
		return DeployResult{Success: false}, err
	}
	if cfg.Bucket == "" {
		return DeployResult{Success: false}, fmt.Errorf("cloud not configured: bucket is empty")
	}

	client, err := newS3Client(cfg)
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to create S3 client: %w", err)
	}

	cleanName := filepath.Base(name)
	if cleanName != name || strings.Contains(name, "..") {
		return DeployResult{Success: false}, fmt.Errorf("invalid backup name")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(cfg.Bucket),
		Key:    aws.String(cleanName),
	})
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("download failed: %w", err)
	}
	defer resp.Body.Close()

	if err := ensureBackupsDir(); err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to create backups dir: %w", err)
	}

	localPath := filepath.Join(backupsDir, cleanName)
	file, err := os.Create(localPath)
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to create local file: %w", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, resp.Body); err != nil {
		os.Remove(localPath)
		return DeployResult{Success: false}, fmt.Errorf("failed to write downloaded data: %w", err)
	}

	return DeployResult{
		Success: true,
		AppName: cleanName,
		Output:  fmt.Sprintf("Downloaded %s from cloud bucket %s", cleanName, cfg.Bucket),
	}, nil
}

// ListCloudBackups lists all objects in the cloud storage bucket.
func ListCloudBackups() ([]CloudBackupInfo, error) {
	if err := checkLinuxOp("cloud list"); err != nil {
		return nil, err
	}

	cfg, err := loadCloudConfig()
	if err != nil {
		return nil, err
	}
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("cloud not configured: bucket is empty")
	}

	client, err := newS3Client(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create S3 client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(cfg.Bucket),
	})
	if err != nil {
		return nil, fmt.Errorf("list failed: %w", err)
	}

	var result []CloudBackupInfo
	for _, obj := range resp.Contents {
		lastModified := ""
		if obj.LastModified != nil {
			lastModified = obj.LastModified.UTC().Format(time.RFC3339)
		}
		result = append(result, CloudBackupInfo{
			Key:          aws.ToString(obj.Key),
			Size:         aws.ToInt64(obj.Size),
			LastModified: lastModified,
		})
	}

	return result, nil
}

// DeleteFromCloud deletes an object from cloud storage.
func DeleteFromCloud(name string) error {
	if err := checkLinuxOp("cloud delete"); err != nil {
		return err
	}

	cfg, err := loadCloudConfig()
	if err != nil {
		return err
	}
	if cfg.Bucket == "" {
		return fmt.Errorf("cloud not configured: bucket is empty")
	}

	client, err := newS3Client(cfg)
	if err != nil {
		return fmt.Errorf("failed to create S3 client: %w", err)
	}

	cleanName := filepath.Base(name)
	if cleanName != name || strings.Contains(name, "..") {
		return fmt.Errorf("invalid backup name")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	_, err = client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(cfg.Bucket),
		Key:    aws.String(cleanName),
	})
	if err != nil {
		return fmt.Errorf("delete failed: %w", err)
	}

	return nil
}

// CleanupOldBackups lists all cloud objects and deletes those older than retentionDays.
func CleanupOldBackups(retentionDays int) (DeployResult, error) {
	if err := checkLinuxOp("cloud cleanup"); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}
	if retentionDays <= 0 {
		return DeployResult{Success: true, Output: "retention_days is 0 or negative, skipping cleanup"}, nil
	}

	cfg, err := loadCloudConfig()
	if err != nil {
		return DeployResult{Success: false}, err
	}
	if cfg.Bucket == "" {
		return DeployResult{Success: false}, fmt.Errorf("cloud not configured: bucket is empty")
	}

	client, err := newS3Client(cfg)
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to create S3 client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cutoff := time.Now().Add(-time.Duration(retentionDays) * 24 * time.Hour)

	resp, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(cfg.Bucket),
	})
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("list failed: %w", err)
	}

	var deleted []string
	for _, obj := range resp.Contents {
		if obj.LastModified != nil && obj.LastModified.Before(cutoff) {
			_, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{
				Bucket: aws.String(cfg.Bucket),
				Key:    obj.Key,
			})
			if err != nil {
				log.Printf("Failed to delete old backup %s: %v", aws.ToString(obj.Key), err)
				continue
			}
			deleted = append(deleted, aws.ToString(obj.Key))
		}
	}

	output := fmt.Sprintf("Cleaned up %d old backup(s)", len(deleted))
	return DeployResult{Success: true, Output: output}, nil
}

// SyncLocalToCloud reads all local backups and uploads each to cloud (skip if already exists).
func SyncLocalToCloud() (DeployResult, error) {
	if err := checkLinuxOp("cloud sync"); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}

	cfg, err := loadCloudConfig()
	if err != nil {
		return DeployResult{Success: false}, err
	}
	if cfg.Bucket == "" {
		return DeployResult{Success: false}, fmt.Errorf("cloud not configured: bucket is empty")
	}

	client, err := newS3Client(cfg)
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to create S3 client: %w", err)
	}

	// List local backups
	localBackups, err := ListBackups()
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to list local backups: %w", err)
	}

	// Build set of existing cloud keys
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cloudResp, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(cfg.Bucket),
	})
	if err != nil {
		return DeployResult{Success: false}, fmt.Errorf("failed to list cloud objects: %w", err)
	}

	cloudKeySet := make(map[string]bool, len(cloudResp.Contents))
	for _, obj := range cloudResp.Contents {
		cloudKeySet[aws.ToString(obj.Key)] = true
	}

	uploaded := 0
	skipped := 0
	for _, lb := range localBackups {
		if cloudKeySet[lb.Name] {
			skipped++
			continue
		}
		result, err := UploadToCloud(lb.Name)
		if err != nil {
			log.Printf("SyncLocalToCloud: upload failed for %s: %v", lb.Name, err)
			continue
		}
		if result.Success {
			uploaded++
		}
	}

	output := fmt.Sprintf("Synced: %d uploaded, %d skipped (already in cloud)", uploaded, skipped)
	return DeployResult{Success: true, Output: output}, nil
}

// CheckCloudConnection tests the S3-compatible cloud connection by listing max 1 object.
func CheckCloudConnection() error {
	cfg, err := loadCloudConfig()
	if err != nil {
		return err
	}
	if cfg.Bucket == "" {
		return fmt.Errorf("cloud not configured: bucket is empty")
	}

	client, err := newS3Client(cfg)
	if err != nil {
		return fmt.Errorf("failed to create S3 client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err = client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket:  aws.String(cfg.Bucket),
		MaxKeys: aws.Int32(1),
	})
	return err
}
