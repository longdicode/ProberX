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
