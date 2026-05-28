package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/proberx/agent/internal/exec"
	"github.com/proberx/agent/internal/metrics"
	"github.com/proberx/agent/internal/probe"
	"github.com/proberx/agent/internal/docker"
	"github.com/proberx/agent/internal/fileops"
	"github.com/proberx/agent/internal/firewall"
	"github.com/proberx/agent/internal/process"
	"github.com/proberx/agent/internal/tools"
	"github.com/proberx/agent/internal/terminal"
	"github.com/proberx/agent/internal/upgrade"
)

var agentToken string
var agentId string
var agentHost string
var dashboardUrl string

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	port := os.Getenv("AGENT_PORT")
	if port == "" {
		port = "9800"
	}
	agentToken = os.Getenv("AGENT_TOKEN")
	agentId = os.Getenv("AGENT_ID")
	agentHost = os.Getenv("AGENT_HOST")
	dashboardUrl = os.Getenv("DASHBOARD_URL")

	if agentId == "" {
		hostname, _ := os.Hostname()
		agentId = fmt.Sprintf("agent-%s-%d", hostname, os.Getpid())
		log.Printf("AGENT_ID not set, using generated: %s", agentId)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /metrics", handleMetrics)
	mux.HandleFunc("POST /probe", withAuth(handleProbe))
	mux.HandleFunc("POST /exec", withAuth(handleExec))
	mux.HandleFunc("GET /processes", withAuth(handleProcesses))
	mux.HandleFunc("GET /terminal", handleTerminal)
	mux.HandleFunc("GET /files/list", withAuth(handleFileList))
	mux.HandleFunc("GET /files/read", withAuth(handleFileRead))
	mux.HandleFunc("GET /files/download", withAuth(handleFileDownload))
	mux.HandleFunc("POST /files/upload", withAuth(handleFileUpload))
	mux.HandleFunc("DELETE /files/delete", withAuth(handleFileDelete))
	mux.HandleFunc("POST /files/mkdir", withAuth(handleFileMkdir))
	mux.HandleFunc("POST /files/rename", withAuth(handleFileRename))
	mux.HandleFunc("GET /containers", withAuth(handleContainers))
	mux.HandleFunc("GET /firewall/rules", withAuth(handleFirewallList))
	mux.HandleFunc("POST /firewall/rules", withAuth(handleFirewallAdd))
	mux.HandleFunc("DELETE /firewall/rules", withAuth(handleFirewallDelete))
	mux.HandleFunc("GET /tools/services", withAuth(handleToolsServicesList))
	mux.HandleFunc("POST /tools/services", withAuth(handleToolsServicesControl))
	mux.HandleFunc("GET /tools/services/{name}", withAuth(handleToolsServicesStatus))
	mux.HandleFunc("POST /tools/ssl", withAuth(handleToolsSSLCheck))
	mux.HandleFunc("GET /tools/logs", withAuth(handleToolsLogsFetch))
	mux.HandleFunc("GET /tools/logs/file", withAuth(handleToolsLogsFile))
	mux.HandleFunc("GET /tools/packages", withAuth(handleToolsPackagesList))
	mux.HandleFunc("POST /tools/packages", withAuth(handleToolsPackagesUpgrade))
	mux.HandleFunc("GET /tools/nginx", withAuth(handleToolsNginxStatus))
	mux.HandleFunc("POST /tools/nginx/reload", withAuth(handleToolsNginxReload))
	mux.HandleFunc("GET /tools/nginx/config", withAuth(handleToolsNginxConfig))
	mux.HandleFunc("GET /tools/deploy/templates", withAuth(handleToolsDeployTemplates))
	mux.HandleFunc("GET /tools/deploy/list", withAuth(handleToolsDeployList))
	mux.HandleFunc("POST /tools/deploy/deploy", withAuth(handleToolsDeployDeploy))
	mux.HandleFunc("POST /tools/deploy/remove", withAuth(handleToolsDeployRemove))
	mux.HandleFunc("GET /tools/deploy/logs", withAuth(handleToolsDeployLogs))
	mux.HandleFunc("POST /tools/deploy/start", withAuth(handleToolsDeployStart))
	mux.HandleFunc("POST /tools/deploy/stop", withAuth(handleToolsDeployStop))
	mux.HandleFunc("POST /tools/deploy/restart", withAuth(handleToolsDeployRestart))
	mux.HandleFunc("POST /tools/deploy/update", withAuth(handleToolsDeployUpdate))
	mux.HandleFunc("GET /tools/deploy/progress", withAuth(handleToolsDeployProgress))
	mux.HandleFunc("POST /tools/deploy/check-ports", withAuth(handleToolsCheckPorts))

	srv := &http.Server{Addr: ":" + port, Handler: withLogging(mux)}

	go func() {
		log.Printf("Agent %s listening on :%s", agentId, port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	go registerWithDashboard()
	go heartbeatLoop()
	go metricsPushLoop()

	upgradeRepo := os.Getenv("UPGRADE_REPO")
	upgradeInterval := 0 * time.Second
	if v := os.Getenv("UPGRADE_CHECK_INTERVAL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			upgradeInterval = d
		}
	}
	go upgrade.Start(upgradeRepo, upgradeInterval)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}
	log.Println("Agent stopped")
}

func registerWithDashboard() {
	if dashboardUrl == "" {
		log.Println("DASHBOARD_URL not set, skipping registration")
		return
	}

	hostname, _ := os.Hostname()
	info := map[string]any{
		"hostname":   hostname,
		"os":         runtime.GOOS,
		"arch":       runtime.GOARCH,
		"num_cpu":    runtime.NumCPU(),
		"go_version": runtime.Version(),
	}
	if agentHost != "" {
		info["agent_host"] = agentHost
	}
	body := map[string]any{
		"agentId":  agentId,
		"hostInfo": info,
	}

	url := dashboardUrl + "/api/v1/agent/register"
	for i := 0; i < 5; i++ {
		bodyBytes, _ := json.Marshal(body)
		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(bodyBytes))
		if err != nil {
			log.Printf("register: failed to create request: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("register attempt %d/5: %v", i+1, err)
			time.Sleep(time.Duration(i+1) * time.Second)
			continue
		}
		resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			log.Printf("Registered with dashboard: %s", url)
			return
		}
		if resp.StatusCode == 404 {
			log.Printf("register: server %s not found in dashboard (status %d), will retry", agentId, resp.StatusCode)
		} else {
			log.Printf("register attempt %d/5: unexpected status %d", i+1, resp.StatusCode)
		}
		time.Sleep(time.Duration(i+1) * time.Second)
	}
	log.Println("register: all attempts failed, giving up")
}

func heartbeatLoop() {
	if dashboardUrl == "" {
		return
	}
	url := dashboardUrl + "/api/v1/agent/heartbeat"
	for {
		time.Sleep(30 * time.Second)
		body := map[string]any{
			"agentId":   agentId,
			"timestamp": time.Now().UnixMilli(),
		}
		bodyBytes, _ := json.Marshal(body)
		resp, err := http.DefaultClient.Post(url, "application/json", bytes.NewReader(bodyBytes))
		if err != nil {
			log.Printf("heartbeat: %v", err)
			continue
		}
		resp.Body.Close()
	}
}

func metricsPushLoop() {
	if dashboardUrl == "" {
		return
	}
	url := dashboardUrl + "/api/v1/agent/metrics"
	for {
		time.Sleep(60 * time.Second)
		snap, err := metrics.Collect()
		if err != nil {
			log.Printf("metrics push: collect: %v", err)
			continue
		}
		snapBytes, _ := json.Marshal(snap)
		var snapMap map[string]any
		json.Unmarshal(snapBytes, &snapMap)
		snapMap["agentId"] = agentId
		bodyBytes, _ := json.Marshal(snapMap)
		resp, err := http.DefaultClient.Post(url, "application/json", bytes.NewReader(bodyBytes))
		if err != nil {
			log.Printf("metrics push: %v", err)
			continue
		}
		resp.Body.Close()
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"version": upgrade.Version,
		"time":    time.Now().UnixMilli(),
	})
}

func handleMetrics(w http.ResponseWriter, r *http.Request) {
	snap, err := metrics.Collect()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, snap)
}

func handleProbe(w http.ResponseWriter, r *http.Request) {
	var req probe.Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	result := probe.Execute(req)
	writeJSON(w, http.StatusOK, result)
}

func handleExec(w http.ResponseWriter, r *http.Request) {
	var req exec.Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	result := exec.Run(req)
	writeJSON(w, http.StatusOK, result)
}

func handleProcesses(w http.ResponseWriter, r *http.Request) {
	procs, err := process.List(20)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, procs)
}

func handleTerminal(w http.ResponseWriter, r *http.Request) {
	if agentToken != "" && r.URL.Query().Get("token") != agentToken {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
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

func handleFileList(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}
	entries, err := fileops.List(path)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func handleFileRead(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "path required"})
		return
	}
	result, err := fileops.Read(path)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleFileDownload(w http.ResponseWriter, r *http.Request) {
	fileops.ServeDownload(w, r)
}

func handleFileUpload(w http.ResponseWriter, r *http.Request) {
	fileops.HandleUpload(w, r)
}

func handleFileDelete(w http.ResponseWriter, r *http.Request) {
	var req fileops.DeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := fileops.Delete(req.Path); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func handleFileMkdir(w http.ResponseWriter, r *http.Request) {
	var req fileops.MkdirRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := fileops.Mkdir(req.Path); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "created"})
}

func handleFileRename(w http.ResponseWriter, r *http.Request) {
	var req fileops.RenameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := fileops.Rename(req.Path, req.NewName); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "renamed"})
}

func handleContainers(w http.ResponseWriter, r *http.Request) {
	containers, err := docker.List()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, containers)
}

func handleFirewallList(w http.ResponseWriter, r *http.Request) {
	result, err := firewall.List()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleFirewallAdd(w http.ResponseWriter, r *http.Request) {
	var req firewall.AddRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Target == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "target is required"})
		return
	}
	result, err := firewall.AddRule(req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleFirewallDelete(w http.ResponseWriter, r *http.Request) {
	var req firewall.DeleteRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	result, err := firewall.DeleteRule(req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// --- Tools: systemd services ---

func handleToolsServicesList(w http.ResponseWriter, r *http.Request) {
	units, err := tools.ListServices()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, units)
}

func handleToolsServicesControl(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   string `json:"name"`
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	result, err := tools.ControlService(req.Name, req.Action)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleToolsServicesStatus(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	result, err := tools.ServiceStatus(name)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// --- Tools: SSL ---

func handleToolsSSLCheck(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Domain == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "domain is required"})
		return
	}
	info, err := tools.CheckSSL(req.Domain)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, info)
}

// --- Tools: Logs ---

func handleToolsLogsFetch(w http.ResponseWriter, r *http.Request) {
	unit := r.URL.Query().Get("unit")
	lines := 100
	if n, err := fmt.Sscanf(r.URL.Query().Get("lines"), "%d", &lines); n != 1 || err != nil {
		lines = 100
	}
	since := r.URL.Query().Get("since")
	entries, err := tools.FetchLogs(unit, lines, since)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func handleToolsLogsFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	lines := 100
	if n, err := fmt.Sscanf(r.URL.Query().Get("lines"), "%d", &lines); n != 1 || err != nil {
		lines = 100
	}
	entries, err := tools.FetchLogFile(path, lines)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

// --- Tools: Packages ---

func handleToolsPackagesList(w http.ResponseWriter, r *http.Request) {
	upgradableOnly := r.URL.Query().Get("upgradable") == "true"
	pkgs, err := tools.ListPackages(upgradableOnly)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, pkgs)
}

func handleToolsPackagesUpgrade(w http.ResponseWriter, r *http.Request) {
	result, err := tools.UpgradePackages()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// --- Tools: Nginx ---

func handleToolsNginxStatus(w http.ResponseWriter, r *http.Request) {
	status, err := tools.NginxStatusCheck()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func handleToolsNginxReload(w http.ResponseWriter, r *http.Request) {
	result, err := tools.NginxReload()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleToolsNginxConfig(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	result, err := tools.NginxConfig(path)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// --- Tools: Deploy ---

func handleToolsDeployTemplates(w http.ResponseWriter, r *http.Request) {
	templates := tools.ListTemplates()
	writeJSON(w, http.StatusOK, templates)
}

func handleToolsDeployList(w http.ResponseWriter, r *http.Request) {
	deployments, err := tools.GetDeployments()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, deployments)
}

func handleToolsDeployDeploy(w http.ResponseWriter, r *http.Request) {
	var req tools.DeployRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.TemplateID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "template_id is required"})
		return
	}
	if req.AppName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "app_name is required"})
		return
	}
	result, err := tools.DeployApp(req)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleToolsDeployRemove(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.AppName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "appName is required"})
		return
	}
	result, err := tools.RemoveDeployment(req.AppName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleToolsDeployLogs(w http.ResponseWriter, r *http.Request) {
	appName := r.URL.Query().Get("appName")
	if appName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "appName is required"})
		return
	}
	logs, err := tools.GetDeploymentLogs(appName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, logs)
}

func withAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if agentToken == "" {
			next(w, r)
			return
		}
		header := r.Header.Get("Authorization")
		if header != "Bearer "+agentToken {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		next(w, r)
	}
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func handleToolsDeployStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.AppName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "appName is required"})
		return
	}
	result, err := tools.StartDeployment(req.AppName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleToolsDeployStop(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.AppName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "appName is required"})
		return
	}
	result, err := tools.StopDeployment(req.AppName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleToolsDeployRestart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.AppName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "appName is required"})
		return
	}
	result, err := tools.RestartDeployment(req.AppName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func handleToolsDeployUpdate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName string `json:"appName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.AppName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "appName is required"})
		return
	}
	result, err := tools.UpdateDeployment(req.AppName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}


func handleToolsDeployProgress(w http.ResponseWriter, r *http.Request) {
	appName := r.URL.Query().Get("appName")
	if appName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "appName is required"})
		return
	}
	logs, err := tools.ReadDeployLog(appName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"logs": logs})
}

func handleToolsCheckPorts(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Ports []string `json:"ports"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	result, err := tools.CheckPorts(req.Ports)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}
