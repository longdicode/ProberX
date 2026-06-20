package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/proberx/agent/internal/docker"
	"github.com/proberx/agent/internal/exec"
	"github.com/proberx/agent/internal/fileops"
	"github.com/proberx/agent/internal/firewall"
	"github.com/proberx/agent/internal/metrics"
	"github.com/proberx/agent/internal/probe"
	"github.com/proberx/agent/internal/process"
	"github.com/proberx/agent/internal/terminal"
	"github.com/proberx/agent/internal/tools"
	"github.com/proberx/agent/internal/upgrade"
)

// Config holds shared configuration and state for all HTTP handlers.
type Config struct {
	AgentToken string
	AgentId    string
	AgentHost  string
	WsUpgrader websocket.Upgrader
}

// NewConfig creates a Config with defaults.
func NewConfig(agentToken, agentId, agentHost string) *Config {
	return &Config{
		AgentToken: agentToken,
		AgentId:    agentId,
		AgentHost:  agentHost,
		WsUpgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// If agent has a token configured, require it in query param
				if agentToken != "" {
					return r.URL.Query().Get("token") == agentToken
				}
				return true // dev mode — no token configured
			},
		},
	}
}

// WithAuth is middleware that checks the Authorization header if AgentToken is set.
func (c *Config) WithAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if c.AgentToken == "" {
			next(w, r)
			return
		}
		header := r.Header.Get("Authorization")
		if header != "Bearer "+c.AgentToken {
			tools.WriteError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		next(w, r)
	}
}

// WithLogging is middleware that logs each HTTP request.
func WithLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
	})
}

// --- Core handlers ---

// HandleHealth returns agent health and version info.
func (c *Config) HandleHealth(w http.ResponseWriter, r *http.Request) {
	tools.WriteOK(w, map[string]any{
		"status":  "ok",
		"version": upgrade.Version,
		"time":    time.Now().UnixMilli(),
	})
}

// HandleMetrics collects and returns system metrics.
func (c *Config) HandleMetrics(w http.ResponseWriter, r *http.Request) {
	snap, err := metrics.Collect()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, snap)
}

// HandleProbe executes a network probe.
func (c *Config) HandleProbe(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[probe.Request](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result := probe.Execute(req)
	tools.WriteOK(w, result)
}

// HandleExec runs a shell command.
func (c *Config) HandleExec(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[exec.Request](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result := exec.Run(req)
	tools.WriteOK(w, result)
}

// HandleProcesses returns the top processes.
func (c *Config) HandleProcesses(w http.ResponseWriter, r *http.Request) {
	procs, err := process.List(20)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, procs)
}

// HandleTerminal upgrades to a WebSocket and starts an interactive terminal session.
func (c *Config) HandleTerminal(w http.ResponseWriter, r *http.Request) {
	if c.AgentToken != "" && r.URL.Query().Get("token") != c.AgentToken {
		tools.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	conn, err := c.WsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("terminal: upgrade error: %v", err)
		return
	}

	session, err := terminal.NewSession(conn, 80, 24)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage,
			[]byte(`{"type":"terminal:error","payload":{"message":"`+err.Error()+`"}}`))
		conn.Close()
		return
	}
	session.Run()
}

// --- File operations ---

// HandleFileList lists directory contents.
func (c *Config) HandleFileList(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}
	entries, err := fileops.List(path)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	tools.WriteOK(w, entries)
}

// HandleFileRead reads a file's contents.
func (c *Config) HandleFileRead(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		tools.WriteError(w, http.StatusBadRequest, "path required")
		return
	}
	result, err := fileops.Read(path)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleFileDownload serves a file download.
func (c *Config) HandleFileDownload(w http.ResponseWriter, r *http.Request) {
	fileops.ServeDownload(w, r)
}

// HandleFileUpload handles a file upload.
func (c *Config) HandleFileUpload(w http.ResponseWriter, r *http.Request) {
	fileops.HandleUpload(w, r)
}

// HandleFileDelete deletes a file or directory.
func (c *Config) HandleFileDelete(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[fileops.DeleteRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := fileops.Delete(req.Path); err != nil {
		tools.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "deleted"})
}

// HandleFileMkdir creates a directory.
func (c *Config) HandleFileMkdir(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[fileops.MkdirRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := fileops.Mkdir(req.Path); err != nil {
		tools.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "created"})
}

// HandleFileRename renames a file or directory.
func (c *Config) HandleFileRename(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[fileops.RenameRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := fileops.Rename(req.Path, req.NewName); err != nil {
		tools.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "renamed"})
}

// HandleFileWrite writes content to a file.
func (c *Config) HandleFileWrite(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[fileops.WriteRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Path == "" {
		tools.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}
	if err := fileops.Write(req.Path, req.Content); err != nil {
		tools.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "written"})
}

// --- Containers ---

// HandleContainers lists Docker containers.
func (c *Config) HandleContainers(w http.ResponseWriter, r *http.Request) {
	containers, err := docker.List()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, containers)
}

// --- Docker Images ---

// HandleImagesList lists Docker images.
func (c *Config) HandleImagesList(w http.ResponseWriter, r *http.Request) {
	images, err := docker.ListImages()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, images)
}

// HandleImagesPull pulls a Docker image from a registry.
func (c *Config) HandleImagesPull(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		tools.WriteError(w, http.StatusBadRequest, "image name is required")
		return
	}
	result, err := docker.PullImage(req.Name)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleImagesDelete deletes a Docker image by ID.
func (c *Config) HandleImagesDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		tools.WriteError(w, http.StatusBadRequest, "missing image id")
		return
	}
	if err := docker.DeleteImage(id); err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "deleted"})
}

// HandleImagesInspect returns detailed information about a Docker image.
func (c *Config) HandleImagesInspect(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		tools.WriteError(w, http.StatusBadRequest, "missing image id")
		return
	}
	info, err := docker.InspectImage(id)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, info)
}

// HandleImagesPrune removes all unused (dangling) Docker images.
func (c *Config) HandleImagesPrune(w http.ResponseWriter, r *http.Request) {
	result, err := docker.PruneImages()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Firewall ---

// HandleFirewallList lists firewall rules.
func (c *Config) HandleFirewallList(w http.ResponseWriter, r *http.Request) {
	result, err := firewall.List()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleFirewallAdd adds a firewall rule.
func (c *Config) HandleFirewallAdd(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[firewall.AddRuleRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Target == "" {
		tools.WriteError(w, http.StatusBadRequest, "target is required")
		return
	}
	result, err := firewall.AddRule(req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleFirewallDelete deletes a firewall rule.
func (c *Config) HandleFirewallDelete(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[firewall.DeleteRuleRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := firewall.DeleteRule(req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: systemd services ---

// HandleToolsServicesList lists systemd services.
func (c *Config) HandleToolsServicesList(w http.ResponseWriter, r *http.Request) {
	units, err := tools.ListServices()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, units)
}

// HandleToolsServicesControl performs start/stop/restart on a service.
func (c *Config) HandleToolsServicesControl(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   string `json:"name"`
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := tools.ControlService(req.Name, req.Action)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsServicesStatus returns detailed status for a service.
func (c *Config) HandleToolsServicesStatus(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	result, err := tools.ServiceStatus(name)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: SSL ---

// HandleToolsSSLCheck checks SSL certificate info for a domain.
func (c *Config) HandleToolsSSLCheck(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Domain == "" {
		tools.WriteError(w, http.StatusBadRequest, "domain is required")
		return
	}
	info, err := tools.CheckSSL(req.Domain)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, info)
}

// HandleToolsSSLIssue issues a Let's Encrypt SSL certificate.
func (c *Config) HandleToolsSSLIssue(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.SSLIssueRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Domain == "" || req.Email == "" {
		tools.WriteError(w, http.StatusBadRequest, "domain and email are required")
		return
	}
	result, err := tools.IssueCert(req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsSSLRenew renews an SSL certificate.
func (c *Config) HandleToolsSSLRenew(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := tools.RenewCert(req.Domain)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: Logs ---

// HandleToolsLogsFetch fetches system logs via journalctl.
func (c *Config) HandleToolsLogsFetch(w http.ResponseWriter, r *http.Request) {
	unit := r.URL.Query().Get("unit")
	lines := 100
	if n, err := fmt.Sscanf(r.URL.Query().Get("lines"), "%d", &lines); n != 1 || err != nil {
		lines = 100
	}
	since := r.URL.Query().Get("since")
	entries, err := tools.FetchLogs(unit, lines, since)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, entries)
}

// HandleToolsLogsFile reads last N lines from a log file.
func (c *Config) HandleToolsLogsFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	lines := 100
	if n, err := fmt.Sscanf(r.URL.Query().Get("lines"), "%d", &lines); n != 1 || err != nil {
		lines = 100
	}
	entries, err := tools.FetchLogFile(path, lines)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, entries)
}

// --- Tools: Packages ---

// HandleToolsPackagesList lists installed or upgradable packages.
func (c *Config) HandleToolsPackagesList(w http.ResponseWriter, r *http.Request) {
	upgradableOnly := r.URL.Query().Get("upgradable") == "true"
	pkgs, err := tools.ListPackages(upgradableOnly)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, pkgs)
}

// HandleToolsPackagesUpgrade runs a system package upgrade.
func (c *Config) HandleToolsPackagesUpgrade(w http.ResponseWriter, r *http.Request) {
	result, err := tools.UpgradePackages()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: Nginx ---

// HandleToolsNginxStatus returns nginx installation and config status.
func (c *Config) HandleToolsNginxStatus(w http.ResponseWriter, r *http.Request) {
	status, err := tools.NginxStatusCheck()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, status)
}

// HandleToolsNginxReload reloads nginx configuration.
func (c *Config) HandleToolsNginxReload(w http.ResponseWriter, r *http.Request) {
	result, err := tools.NginxReload()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsNginxConfig returns the main nginx config content.
func (c *Config) HandleToolsNginxConfig(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	result, err := tools.NginxConfig(path)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsNginxVHostsList lists all nginx virtual hosts.
func (c *Config) HandleToolsNginxVHostsList(w http.ResponseWriter, r *http.Request) {
	vhosts, err := tools.ListVHosts()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, vhosts)
}

// HandleToolsNginxVHostsCreate creates a new nginx virtual host.
func (c *Config) HandleToolsNginxVHostsCreate(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.CreateVHostRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := tools.CreateVHost(req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsNginxVHostsDelete deletes a nginx virtual host.
func (c *Config) HandleToolsNginxVHostsDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := tools.DeleteVHost(req.Domain)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: Deploy ---

// HandleToolsDeployTemplates lists available app deployment templates.
func (c *Config) HandleToolsDeployTemplates(w http.ResponseWriter, r *http.Request) {
	templates := tools.ListTemplates()
	tools.WriteOK(w, templates)
}

// HandleToolsDeployList lists deployed apps.
func (c *Config) HandleToolsDeployList(w http.ResponseWriter, r *http.Request) {
	deployments, err := tools.GetDeployments()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, deployments)
}

// HandleToolsDeployDeploy deploys a new app.
func (c *Config) HandleToolsDeployDeploy(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.DeployRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TemplateID == "" {
		tools.WriteError(w, http.StatusBadRequest, "template_id is required")
		return
	}
	if req.AppName == "" {
		tools.WriteError(w, http.StatusBadRequest, "app_name is required")
		return
	}
	result, err := tools.DeployApp(req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsDeployRemove removes a deployed app.
func (c *Config) HandleToolsDeployRemove(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AppName == "" {
		tools.WriteError(w, http.StatusBadRequest, "appName is required")
		return
	}
	result, err := tools.RemoveDeployment(req.AppName)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsDeployLogs returns logs for a deployed app.
func (c *Config) HandleToolsDeployLogs(w http.ResponseWriter, r *http.Request) {
	appName := r.URL.Query().Get("appName")
	if appName == "" {
		tools.WriteError(w, http.StatusBadRequest, "appName is required")
		return
	}
	logs, err := tools.GetDeploymentLogs(appName)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, logs)
}

// HandleToolsDeployStart starts a deployed app.
func (c *Config) HandleToolsDeployStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AppName == "" {
		tools.WriteError(w, http.StatusBadRequest, "appName is required")
		return
	}
	result, err := tools.StartDeployment(req.AppName)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsDeployStop stops a deployed app.
func (c *Config) HandleToolsDeployStop(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AppName == "" {
		tools.WriteError(w, http.StatusBadRequest, "appName is required")
		return
	}
	result, err := tools.StopDeployment(req.AppName)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsDeployRestart restarts a deployed app.
func (c *Config) HandleToolsDeployRestart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AppName == "" {
		tools.WriteError(w, http.StatusBadRequest, "appName is required")
		return
	}
	result, err := tools.RestartDeployment(req.AppName)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsDeployUpdate updates a deployed app (pull + up).
func (c *Config) HandleToolsDeployUpdate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AppName == "" {
		tools.WriteError(w, http.StatusBadRequest, "appName is required")
		return
	}
	result, err := tools.UpdateDeployment(req.AppName)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsDeployProgress reads the deploy log for an app.
func (c *Config) HandleToolsDeployProgress(w http.ResponseWriter, r *http.Request) {
	appName := r.URL.Query().Get("appName")
	if appName == "" {
		tools.WriteError(w, http.StatusBadRequest, "appName is required")
		return
	}
	logs, err := tools.ReadDeployLog(appName)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"logs": logs})
}

// HandleToolsCheckPorts checks if the given ports are in use.
func (c *Config) HandleToolsCheckPorts(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Ports []string `json:"ports"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := tools.CheckPorts(req.Ports)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: Databases ---

// HandleToolsDatabasesList lists installed databases.
func (c *Config) HandleToolsDatabasesList(w http.ResponseWriter, r *http.Request) {
	dbs, err := tools.ListDatabases()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, dbs)
}

// HandleToolsDatabasesInstall installs a new database.
func (c *Config) HandleToolsDatabasesInstall(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.DatabaseInstallRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type == "" || req.Port == "" {
		tools.WriteError(w, http.StatusBadRequest, "type and port are required")
		return
	}
	result, err := tools.InstallDatabase(req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsDatabasesRemove removes a database.
func (c *Config) HandleToolsDatabasesRemove(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := tools.RemoveDatabase(req.Type)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: Backups ---

// HandleToolsBackupsList lists all backups.
func (c *Config) HandleToolsBackupsList(w http.ResponseWriter, r *http.Request) {
	backups, err := tools.ListBackups()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, backups)
}

// HandleToolsBackupsCreateFile creates a file backup.
func (c *Config) HandleToolsBackupsCreateFile(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.CreateFileBackupRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SourcePath == "" {
		tools.WriteError(w, http.StatusBadRequest, "source_path is required")
		return
	}
	if req.Name == "" {
		tools.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	result, err := tools.CreateFileBackup(req.SourcePath, req.Name)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := map[string]any{
		"success":  result.Success,
		"app_name": result.AppName,
		"output":   result.Output,
	}

	// Auto-upload if configured (per-request override or global config)
	autoUpload := false
	if cfg, cfgErr := tools.LoadCloudConfigInternal(); cfgErr == nil {
		autoUpload = cfg.AutoUpload
	}
	if req.AutoUpload != nil {
		autoUpload = *req.AutoUpload
	}
	if autoUpload && result.Success && result.AppName != "" {
		uploadResult, uploadErr := tools.UploadToCloud(result.AppName)
		if uploadErr != nil {
			resp["auto_uploaded"] = false
			resp["auto_upload_error"] = uploadErr.Error()
			log.Printf("Auto-upload failed for %s: %v", result.AppName, uploadErr)
		} else {
			resp["auto_uploaded"] = true
			resp["auto_upload_output"] = uploadResult.Output
		}
	}

	tools.WriteOK(w, resp)
}

// HandleToolsBackupsCreateDB creates a database backup.
func (c *Config) HandleToolsBackupsCreateDB(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.CreateDBBackupRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DBType == "" {
		tools.WriteError(w, http.StatusBadRequest, "db_type is required")
		return
	}
	if req.Name == "" {
		tools.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	result, err := tools.CreateDBBackup(req.DBType, req.Name)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := map[string]any{
		"success":  result.Success,
		"app_name": result.AppName,
		"output":   result.Output,
	}

	// Auto-upload if configured (per-request override or global config)
	autoUpload := false
	if cfg, cfgErr := tools.LoadCloudConfigInternal(); cfgErr == nil {
		autoUpload = cfg.AutoUpload
	}
	if req.AutoUpload != nil {
		autoUpload = *req.AutoUpload
	}
	if autoUpload && result.Success && result.AppName != "" {
		uploadResult, uploadErr := tools.UploadToCloud(result.AppName)
		if uploadErr != nil {
			resp["auto_uploaded"] = false
			resp["auto_upload_error"] = uploadErr.Error()
			log.Printf("Auto-upload failed for %s: %v", result.AppName, uploadErr)
		} else {
			resp["auto_uploaded"] = true
			resp["auto_upload_output"] = uploadResult.Output
		}
	}

	tools.WriteOK(w, resp)
}

// HandleToolsBackupsDelete deletes a backup.
func (c *Config) HandleToolsBackupsDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := tools.DeleteBackup(req.Name); err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "deleted"})
}

// HandleToolsBackupsRestore restores a backup.
func (c *Config) HandleToolsBackupsRestore(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		tools.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	result, err := tools.RestoreBackup(req.Name)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: Cloud Backups ---

// HandleToolsBackupsCloudConfig returns the current cloud backup config with secret_key masked.
func (c *Config) HandleToolsBackupsCloudConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := tools.LoadCloudConfigPublic()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, cfg)
}

// HandleToolsBackupsCloudConfigPut saves the cloud backup config.
func (c *Config) HandleToolsBackupsCloudConfigPut(w http.ResponseWriter, r *http.Request) {
	cfg, err := tools.DecodeBody[tools.CloudBackupConfig](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := tools.SaveCloudConfigInternal(cfg); err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "saved"})
}

// HandleToolsBackupsCloudUpload uploads a local backup to cloud storage.
func (c *Config) HandleToolsBackupsCloudUpload(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.CloudBackupRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		tools.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	result, err := tools.UploadToCloud(req.Name)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsBackupsCloudDownload downloads a backup from cloud to local storage.
func (c *Config) HandleToolsBackupsCloudDownload(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.CloudBackupRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		tools.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	result, err := tools.DownloadFromCloud(req.Name)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsBackupsCloudList lists objects in the cloud bucket.
func (c *Config) HandleToolsBackupsCloudList(w http.ResponseWriter, r *http.Request) {
	objects, err := tools.ListCloudBackups()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, objects)
}

// HandleToolsBackupsCloudDelete deletes an object from cloud storage.
func (c *Config) HandleToolsBackupsCloudDelete(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.CloudBackupRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		tools.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if err := tools.DeleteFromCloud(req.Name); err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "deleted"})
}

// HandleToolsBackupsCloudSync syncs all local backups to cloud.
func (c *Config) HandleToolsBackupsCloudSync(w http.ResponseWriter, r *http.Request) {
	result, err := tools.SyncLocalToCloud()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsBackupsCloudCleanup removes old cloud backups based on retention days.
func (c *Config) HandleToolsBackupsCloudCleanup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RetentionDays int `json:"retention_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RetentionDays <= 0 {
		tools.WriteError(w, http.StatusBadRequest, "retention_days must be greater than 0")
		return
	}
	result, err := tools.CleanupOldBackups(req.RetentionDays)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsBackupsCloudTest tests the cloud connection.
func (c *Config) HandleToolsBackupsCloudTest(w http.ResponseWriter, r *http.Request) {
	err := tools.CheckCloudConnection()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "connected"})
}

// --- Tools: Security ---

// HandleToolsSecuritySSH audits SSH configuration.
func (c *Config) HandleToolsSecuritySSH(w http.ResponseWriter, r *http.Request) {
	findings, err := tools.AuditSSH()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, findings)
}

// HandleToolsSecurityPortScan runs a port scan.
func (c *Config) HandleToolsSecurityPortScan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Target string `json:"target"`
		Ports  string `json:"ports"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Target == "" {
		tools.WriteError(w, http.StatusBadRequest, "target is required")
		return
	}
	result, err := tools.RunPortScan(req.Target, req.Ports)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsSecurityFail2ban gets fail2ban status.
func (c *Config) HandleToolsSecurityFail2ban(w http.ResponseWriter, r *http.Request) {
	jails, err := tools.GetFail2banStatus()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, jails)
}

// HandleToolsSecurityFail2banUnban unbans an IP from a fail2ban jail.
func (c *Config) HandleToolsSecurityFail2banUnban(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Jail string `json:"jail"`
		IP   string `json:"ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.IP == "" {
		tools.WriteError(w, http.StatusBadRequest, "ip is required")
		return
	}
	result, err := tools.Fail2banUnban(req.Jail, req.IP)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsSecurityFail2banBan bans an IP in a fail2ban jail.
func (c *Config) HandleToolsSecurityFail2banBan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Jail string `json:"jail"`
		IP   string `json:"ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.IP == "" {
		tools.WriteError(w, http.StatusBadRequest, "ip is required")
		return
	}
	result, err := tools.Fail2banBan(req.Jail, req.IP)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: Shell AI ---

// HandleToolsShellAIGenerate generates a shell command from a natural language prompt.
func (c *Config) HandleToolsShellAIGenerate(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.ShellAIGenerateRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Prompt == "" {
		tools.WriteError(w, http.StatusBadRequest, "prompt is required")
		return
	}
	if req.Provider != "custom" && req.Provider != "claude" {
		if req.APIKey == "" {
			tools.WriteError(w, http.StatusBadRequest, "api_key is required")
			return
		}
	}
	result, err := tools.ShellAIGenerate(req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// HandleToolsShellAIExecute executes a shell command.
func (c *Config) HandleToolsShellAIExecute(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.ShellAIExecuteRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Command == "" {
		tools.WriteError(w, http.StatusBadRequest, "command is required")
		return
	}
	result, err := tools.ShellAIExecute(req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, result)
}

// --- Tools: DNS ---

// HandleToolsDNSProviders returns the list of supported DNS providers.
func (c *Config) HandleToolsDNSProviders(w http.ResponseWriter, r *http.Request) {
	providers := []string{"cloudflare", "dnspod", "godaddy", "vercel", "digitalocean"}
	tools.WriteOK(w, providers)
}

// HandleToolsDNSConfig returns the current DNS config with secrets masked.
func (c *Config) HandleToolsDNSConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := tools.LoadDNSConfigPublic()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, cfg)
}

// HandleToolsDNSConfigSave saves the DNS provider config.
func (c *Config) HandleToolsDNSConfigSave(w http.ResponseWriter, r *http.Request) {
	cfg, err := tools.DecodeBody[tools.DNSConfig](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := tools.SaveDNSConfigInternal(cfg); err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "saved"})
}

// HandleToolsDNSZones lists all DNS zones for the configured provider.
func (c *Config) HandleToolsDNSZones(w http.ResponseWriter, r *http.Request) {
	provider, err := tools.NewDNSProviderFromConfig()
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "DNS provider not configured: "+err.Error())
		return
	}
	zones, err := provider.ListZones()
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if zones == nil {
		zones = []tools.DNSZone{}
	}
	tools.WriteOK(w, zones)
}

// HandleToolsDNSRecords lists DNS records for a zone.
func (c *Config) HandleToolsDNSRecords(w http.ResponseWriter, r *http.Request) {
	zoneId := r.URL.Query().Get("zoneId")
	if zoneId == "" {
		tools.WriteError(w, http.StatusBadRequest, "zoneId is required")
		return
	}
	provider, err := tools.NewDNSProviderFromConfig()
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "DNS provider not configured: "+err.Error())
		return
	}
	records, err := provider.ListRecords(zoneId)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if records == nil {
		records = []tools.DNSRecord{}
	}
	tools.WriteOK(w, records)
}

// HandleToolsDNSRecordCreate creates a new DNS record.
func (c *Config) HandleToolsDNSRecordCreate(w http.ResponseWriter, r *http.Request) {
	req, err := tools.DecodeBody[tools.CreateDNSRecordRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ZoneId == "" {
		tools.WriteError(w, http.StatusBadRequest, "zone_id is required")
		return
	}
	if req.Name == "" || req.Type == "" || req.Content == "" {
		tools.WriteError(w, http.StatusBadRequest, "name, type, and content are required")
		return
	}
	provider, err := tools.NewDNSProviderFromConfig()
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "DNS provider not configured: "+err.Error())
		return
	}
	record, err := provider.CreateRecord(req.ZoneId, req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, record)
}

// HandleToolsDNSRecordUpdate updates an existing DNS record.
func (c *Config) HandleToolsDNSRecordUpdate(w http.ResponseWriter, r *http.Request) {
	recordId := r.PathValue("id")
	if recordId == "" {
		tools.WriteError(w, http.StatusBadRequest, "record id is required")
		return
	}
	req, err := tools.DecodeBody[tools.CreateDNSRecordRequest](r)
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ZoneId == "" {
		tools.WriteError(w, http.StatusBadRequest, "zone_id is required")
		return
	}
	if req.Name == "" || req.Type == "" || req.Content == "" {
		tools.WriteError(w, http.StatusBadRequest, "name, type, and content are required")
		return
	}
	provider, err := tools.NewDNSProviderFromConfig()
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "DNS provider not configured: "+err.Error())
		return
	}
	record, err := provider.UpdateRecord(req.ZoneId, recordId, req)
	if err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, record)
}

// HandleToolsDNSRecordDelete deletes a DNS record.
func (c *Config) HandleToolsDNSRecordDelete(w http.ResponseWriter, r *http.Request) {
	recordId := r.PathValue("id")
	if recordId == "" {
		tools.WriteError(w, http.StatusBadRequest, "record id is required")
		return
	}

	var req struct {
		ZoneId string `json:"zone_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		tools.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ZoneId == "" {
		// Try query param
		req.ZoneId = r.URL.Query().Get("zoneId")
	}
	if req.ZoneId == "" {
		tools.WriteError(w, http.StatusBadRequest, "zone_id is required")
		return
	}
	provider, err := tools.NewDNSProviderFromConfig()
	if err != nil {
		tools.WriteError(w, http.StatusBadRequest, "DNS provider not configured: "+err.Error())
		return
	}
	if err := provider.DeleteRecord(req.ZoneId, recordId); err != nil {
		tools.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tools.WriteOK(w, map[string]string{"status": "deleted"})
}
