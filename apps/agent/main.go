package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/proberx/agent/internal/handlers"
	"github.com/proberx/agent/internal/loops"
	"github.com/proberx/agent/internal/upgrade"
)

func main() {
	port := os.Getenv("AGENT_PORT")
	if port == "" {
		port = "9800"
	}
	agentToken := os.Getenv("AGENT_TOKEN")
	agentId := os.Getenv("AGENT_ID")
	agentHost := os.Getenv("AGENT_HOST")
	dashboardUrl := os.Getenv("DASHBOARD_URL")

	if agentId == "" {
		hostname, _ := os.Hostname()
		agentId = fmt.Sprintf("agent-%s-%d", hostname, os.Getpid())
		log.Printf("AGENT_ID not set, using generated: %s", agentId)
	}

	// Create handler config
	h := handlers.NewConfig(agentToken, agentId, agentHost)

	// Register routes
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.HandleHealth)
	mux.HandleFunc("GET /metrics", h.HandleMetrics)
	mux.HandleFunc("POST /probe", h.WithAuth(h.HandleProbe))
	mux.HandleFunc("POST /exec", h.WithAuth(h.HandleExec))
	mux.HandleFunc("GET /processes", h.WithAuth(h.HandleProcesses))
	mux.HandleFunc("GET /terminal", h.HandleTerminal)
	mux.HandleFunc("GET /files/list", h.WithAuth(h.HandleFileList))
	mux.HandleFunc("GET /files/read", h.WithAuth(h.HandleFileRead))
	mux.HandleFunc("GET /files/download", h.WithAuth(h.HandleFileDownload))
	mux.HandleFunc("POST /files/upload", h.WithAuth(h.HandleFileUpload))
	mux.HandleFunc("DELETE /files/delete", h.WithAuth(h.HandleFileDelete))
	mux.HandleFunc("POST /files/mkdir", h.WithAuth(h.HandleFileMkdir))
	mux.HandleFunc("POST /files/rename", h.WithAuth(h.HandleFileRename))
	mux.HandleFunc("POST /files/write", h.WithAuth(h.HandleFileWrite))
	mux.HandleFunc("GET /containers", h.WithAuth(h.HandleContainers))
	mux.HandleFunc("GET /images", h.WithAuth(h.HandleImagesList))
	mux.HandleFunc("POST /images/pull", h.WithAuth(h.HandleImagesPull))
	mux.HandleFunc("DELETE /images/{id}", h.WithAuth(h.HandleImagesDelete))
	mux.HandleFunc("GET /images/{id}/json", h.WithAuth(h.HandleImagesInspect))
	mux.HandleFunc("POST /images/prune", h.WithAuth(h.HandleImagesPrune))
	mux.HandleFunc("GET /firewall/rules", h.WithAuth(h.HandleFirewallList))
	mux.HandleFunc("POST /firewall/rules", h.WithAuth(h.HandleFirewallAdd))
	mux.HandleFunc("DELETE /firewall/rules", h.WithAuth(h.HandleFirewallDelete))
	mux.HandleFunc("GET /tools/services", h.WithAuth(h.HandleToolsServicesList))
	mux.HandleFunc("POST /tools/services", h.WithAuth(h.HandleToolsServicesControl))
	mux.HandleFunc("GET /tools/services/{name}", h.WithAuth(h.HandleToolsServicesStatus))
	mux.HandleFunc("POST /tools/ssl", h.WithAuth(h.HandleToolsSSLCheck))
	mux.HandleFunc("POST /tools/ssl/issue", h.WithAuth(h.HandleToolsSSLIssue))
	mux.HandleFunc("POST /tools/ssl/renew", h.WithAuth(h.HandleToolsSSLRenew))
	mux.HandleFunc("GET /tools/logs", h.WithAuth(h.HandleToolsLogsFetch))
	mux.HandleFunc("GET /tools/logs/file", h.WithAuth(h.HandleToolsLogsFile))
	mux.HandleFunc("GET /tools/packages", h.WithAuth(h.HandleToolsPackagesList))
	mux.HandleFunc("POST /tools/packages", h.WithAuth(h.HandleToolsPackagesUpgrade))
	mux.HandleFunc("GET /tools/nginx", h.WithAuth(h.HandleToolsNginxStatus))
	mux.HandleFunc("POST /tools/nginx/reload", h.WithAuth(h.HandleToolsNginxReload))
	mux.HandleFunc("GET /tools/nginx/config", h.WithAuth(h.HandleToolsNginxConfig))
	mux.HandleFunc("GET /tools/nginx/vhosts", h.WithAuth(h.HandleToolsNginxVHostsList))
	mux.HandleFunc("POST /tools/nginx/vhosts", h.WithAuth(h.HandleToolsNginxVHostsCreate))
	mux.HandleFunc("DELETE /tools/nginx/vhosts", h.WithAuth(h.HandleToolsNginxVHostsDelete))
	mux.HandleFunc("GET /tools/deploy/templates", h.WithAuth(h.HandleToolsDeployTemplates))
	mux.HandleFunc("GET /tools/deploy/list", h.WithAuth(h.HandleToolsDeployList))
	mux.HandleFunc("POST /tools/deploy/deploy", h.WithAuth(h.HandleToolsDeployDeploy))
	mux.HandleFunc("POST /tools/deploy/remove", h.WithAuth(h.HandleToolsDeployRemove))
	mux.HandleFunc("GET /tools/deploy/logs", h.WithAuth(h.HandleToolsDeployLogs))
	mux.HandleFunc("POST /tools/deploy/start", h.WithAuth(h.HandleToolsDeployStart))
	mux.HandleFunc("POST /tools/deploy/stop", h.WithAuth(h.HandleToolsDeployStop))
	mux.HandleFunc("POST /tools/deploy/restart", h.WithAuth(h.HandleToolsDeployRestart))
	mux.HandleFunc("POST /tools/deploy/update", h.WithAuth(h.HandleToolsDeployUpdate))
	mux.HandleFunc("GET /tools/deploy/progress", h.WithAuth(h.HandleToolsDeployProgress))
	mux.HandleFunc("POST /tools/deploy/check-ports", h.WithAuth(h.HandleToolsCheckPorts))
	mux.HandleFunc("GET /tools/databases", h.WithAuth(h.HandleToolsDatabasesList))
	mux.HandleFunc("POST /tools/databases", h.WithAuth(h.HandleToolsDatabasesInstall))
	mux.HandleFunc("DELETE /tools/databases", h.WithAuth(h.HandleToolsDatabasesRemove))
	mux.HandleFunc("GET /tools/backups", h.WithAuth(h.HandleToolsBackupsList))
	mux.HandleFunc("POST /tools/backups/file", h.WithAuth(h.HandleToolsBackupsCreateFile))
	mux.HandleFunc("POST /tools/backups/db", h.WithAuth(h.HandleToolsBackupsCreateDB))
	mux.HandleFunc("DELETE /tools/backups", h.WithAuth(h.HandleToolsBackupsDelete))
	mux.HandleFunc("POST /tools/backups/restore", h.WithAuth(h.HandleToolsBackupsRestore))
	mux.HandleFunc("GET /tools/backups/cloud-config", h.WithAuth(h.HandleToolsBackupsCloudConfig))
	mux.HandleFunc("PUT /tools/backups/cloud-config", h.WithAuth(h.HandleToolsBackupsCloudConfigPut))
	mux.HandleFunc("POST /tools/backups/cloud/upload", h.WithAuth(h.HandleToolsBackupsCloudUpload))
	mux.HandleFunc("POST /tools/backups/cloud/download", h.WithAuth(h.HandleToolsBackupsCloudDownload))
	mux.HandleFunc("GET /tools/backups/cloud/list", h.WithAuth(h.HandleToolsBackupsCloudList))
	mux.HandleFunc("DELETE /tools/backups/cloud", h.WithAuth(h.HandleToolsBackupsCloudDelete))
	mux.HandleFunc("POST /tools/backups/cloud/sync", h.WithAuth(h.HandleToolsBackupsCloudSync))
	mux.HandleFunc("POST /tools/backups/cloud/cleanup", h.WithAuth(h.HandleToolsBackupsCloudCleanup))
	mux.HandleFunc("POST /tools/backups/cloud/test", h.WithAuth(h.HandleToolsBackupsCloudTest))
	mux.HandleFunc("GET /tools/security/ssh", h.WithAuth(h.HandleToolsSecuritySSH))
	mux.HandleFunc("POST /tools/security/portscan", h.WithAuth(h.HandleToolsSecurityPortScan))
	mux.HandleFunc("GET /tools/security/fail2ban", h.WithAuth(h.HandleToolsSecurityFail2ban))
	mux.HandleFunc("POST /tools/security/fail2ban/unban", h.WithAuth(h.HandleToolsSecurityFail2banUnban))
	mux.HandleFunc("POST /tools/security/fail2ban/ban", h.WithAuth(h.HandleToolsSecurityFail2banBan))
	mux.HandleFunc("POST /tools/shell-ai/generate", h.WithAuth(h.HandleToolsShellAIGenerate))
	mux.HandleFunc("POST /tools/shell-ai/execute", h.WithAuth(h.HandleToolsShellAIExecute))

	// DNS
	mux.HandleFunc("GET /tools/dns/providers", h.WithAuth(h.HandleToolsDNSProviders))
	mux.HandleFunc("GET /tools/dns/config", h.WithAuth(h.HandleToolsDNSConfig))
	mux.HandleFunc("POST /tools/dns/config", h.WithAuth(h.HandleToolsDNSConfigSave))
	mux.HandleFunc("GET /tools/dns/zones", h.WithAuth(h.HandleToolsDNSZones))
	mux.HandleFunc("GET /tools/dns/records", h.WithAuth(h.HandleToolsDNSRecords))
	mux.HandleFunc("POST /tools/dns/records", h.WithAuth(h.HandleToolsDNSRecordCreate))
	mux.HandleFunc("PUT /tools/dns/records/{id}", h.WithAuth(h.HandleToolsDNSRecordUpdate))
	mux.HandleFunc("DELETE /tools/dns/records/{id}", h.WithAuth(h.HandleToolsDNSRecordDelete))

	// Start HTTP server
	srv := &http.Server{Addr: ":" + port, Handler: handlers.WithLogging(mux)}

	go func() {
		log.Printf("Agent %s listening on :%s", agentId, port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	// Start background loops
	go loops.RegisterLoop(dashboardUrl, agentId, agentToken, agentHost)
	go loops.HeartbeatLoop(dashboardUrl, agentId)
	go loops.MetricsPushLoop(dashboardUrl, agentId)

	// Start upgrade checker
	upgradeRepo := os.Getenv("UPGRADE_REPO")
	upgradeInterval := 0 * time.Second
	if v := os.Getenv("UPGRADE_CHECK_INTERVAL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			upgradeInterval = d
		}
	}
	go upgrade.Start(upgradeRepo, upgradeInterval)

	// Graceful shutdown
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
