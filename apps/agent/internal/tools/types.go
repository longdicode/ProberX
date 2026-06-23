package tools

// ServiceUnit represents a systemd service unit.
type ServiceUnit struct {
	Name        string `json:"name"`
	LoadState   string `json:"load_state"`
	ActiveState string `json:"active_state"`
	SubState    string `json:"sub_state"`
	Description string `json:"description"`
}

// SSLCertInfo holds SSL certificate details.
type SSLCertInfo struct {
	Domain      string `json:"domain"`
	Issuer      string `json:"issuer"`
	Subject     string `json:"subject"`
	NotBefore   string `json:"not_before"`
	NotAfter    string `json:"not_after"`
	DaysLeft    int    `json:"days_left"`
	SANs        string `json:"sans"`
	Fingerprint string `json:"fingerprint"`
}

// LogEntry represents a single log line.
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Message   string `json:"message"`
	Unit      string `json:"unit,omitempty"`
	Priority  string `json:"priority,omitempty"`
	Hostname  string `json:"hostname,omitempty"`
}

// PackageInfo holds details for an installable/upgradable package.
type PackageInfo struct {
	Name          string `json:"name"`
	Version       string `json:"version"`
	NewVersion    string `json:"new_version,omitempty"`
	Architecture  string `json:"architecture,omitempty"`
	Description   string `json:"description,omitempty"`
	Upgradable    bool   `json:"upgradable"`
}

// AppTemplate describes a deployable app blueprint.
type AppTemplate struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Description  string            `json:"description"`
	Icon         string            `json:"icon"`
	DefaultEnv   map[string]string `json:"default_env"`
	MemoryLimit  string            `json:"memory_limit,omitempty"`
	CpuLimit     string            `json:"cpu_limit,omitempty"`
}

// DeployRequest is the POST body for deploying an app.
type DeployRequest struct {
	TemplateID  string            `json:"template_id"`
	AppName     string            `json:"app_name"`
	Env         map[string]string `json:"env"`
	MemoryLimit string            `json:"memory_limit,omitempty"`
	CpuLimit    string            `json:"cpu_limit,omitempty"`
	Yaml        string            `json:"yaml,omitempty"`
}

// DeploymentInfo describes a deployed app instance.
type DeploymentInfo struct {
	AppName    string            `json:"app_name"`
	Template   string            `json:"template"`
	Status     string            `json:"status"`
	CreatedAt  string            `json:"created_at"`
	Containers []ContainerStatus `json:"containers"`
}

// ContainerStatus is a single container within a compose stack.
type ContainerStatus struct {
	Name   string `json:"name"`
	State  string `json:"state"`
	Status string `json:"status"`
}

// DeployResult is returned after a deploy/remove operation.
type DeployResult struct {
	Success bool   `json:"success"`
	AppName string `json:"app_name"`
	Output  string `json:"output"`
}

// NginxStatus holds nginx service status and config info.
type NginxStatus struct {
	Installed    bool     `json:"installed"`
	Active       bool     `json:"active"`
	Version      string   `json:"version"`
	ConfigTest   string   `json:"config_test"`
	ConfigFiles  []string `json:"config_files"`
	VHosts       []string `json:"vhosts"`
	AccessLog    string   `json:"access_log"`
	ErrorLog     string   `json:"error_log"`
}

// VHostInfo describes a single Nginx virtual host config.
type VHostInfo struct {
	Domain     string `json:"domain"`
	ConfigPath string `json:"config_path"`
	Enabled    bool   `json:"enabled"`
	HasSSL     bool   `json:"has_ssl"`
	TargetPort string `json:"target_port"`
}

// CreateVHostRequest is the body for creating a new virtual host.
type CreateVHostRequest struct {
	Domain     string `json:"domain"`
	TargetPort string `json:"target_port"`
	WebRoot    string `json:"web_root,omitempty"`
	UseSSL     bool   `json:"use_ssl"`
	SSLEmail   string `json:"ssl_email,omitempty"`
}

// DatabaseInfo describes an installed database instance.
type DatabaseInfo struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	Version   string `json:"version"`
	Port      string `json:"port"`
	Status    string `json:"status"`
	Container string `json:"container"`
}

// DatabaseInstallRequest is the body for installing a database.
type DatabaseInstallRequest struct {
	Type     string `json:"type"`
	Version  string `json:"version,omitempty"`
	Port     string `json:"port"`
	Password string `json:"password"`
}

// SSLIssueRequest is the body for issuing a Let's Encrypt certificate.
type SSLIssueRequest struct {
	Domain  string `json:"domain"`
	Email   string `json:"email"`
	Webroot string `json:"webroot,omitempty"`
}

// SSLRenewResult holds the output of certbot renew.
type SSLRenewResult struct {
	Success bool   `json:"success"`
	Domain  string `json:"domain"`
	Output  string `json:"output"`
}

// BackupInfo describes a stored backup archive.
type BackupInfo struct {
	Name      string `json:"name"`
	Type      string `json:"type"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"created_at"`
}

// CreateFileBackupRequest is the body for creating a file backup.
type CreateFileBackupRequest struct {
	SourcePath string `json:"source_path"`
	Name       string `json:"name"`
	AutoUpload *bool  `json:"auto_upload,omitempty"` // per-request override for auto-upload
}

// CreateDBBackupRequest is the body for creating a database backup.
type CreateDBBackupRequest struct {
	DBType string `json:"db_type"`
	Name   string `json:"name"`
	AutoUpload *bool  `json:"auto_upload,omitempty"` // per-request override for auto-upload
}

// CloudBackupConfig holds S3-compatible cloud storage credentials.
type CloudBackupConfig struct {
	Provider      string `json:"provider"`
	Endpoint      string `json:"endpoint"`
	Region        string `json:"region"`
	Bucket        string `json:"bucket"`
	AccessKey     string `json:"access_key"`
	SecretKey     string `json:"secret_key"`
	AutoUpload    bool   `json:"auto_upload"`     // automatically upload after backup creation
	RetentionDays int    `json:"retention_days"`  // days to keep in cloud (0 = forever)
}

// CloudBackupRequest is the body for cloud backup upload/download/delete.
type CloudBackupRequest struct {
	Name string `json:"name"`
}

// CloudBackupInfo describes an object stored in the cloud bucket.
type CloudBackupInfo struct {
	Key          string `json:"key"`
	Size         int64  `json:"size"`
	LastModified string `json:"last_modified"`
}

// DNSConfig holds DNS provider credentials.
type DNSConfig struct {
	Provider  string `json:"provider"`
	ApiKey    string `json:"api_key"`
	ApiSecret string `json:"api_secret"`
}

// DNSZone represents a DNS zone/domain.
type DNSZone struct {
	Id          string `json:"id"`
	Name        string `json:"name"`
	Status      string `json:"status"`
	RecordCount int    `json:"record_count"`
}

// DNSRecord represents a single DNS record.
type DNSRecord struct {
	Id       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Content  string `json:"content"`
	TTL      int    `json:"ttl"`
	Priority int    `json:"priority,omitempty"`
}

// CreateDNSRecordRequest is the request body for creating/updating a DNS record.
type CreateDNSRecordRequest struct {
	ZoneId   string `json:"zone_id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Content  string `json:"content"`
	TTL      int    `json:"ttl"`
	Priority int    `json:"priority,omitempty"`
}

// ShellAIConfig holds the AI provider settings for Shell AI tool.
type ShellAIConfig struct {
	Provider string json:"provider"
	Model    string json:"model"
	APIKey   string json:"api_key"
	APIURL   string json:"api_url"
}