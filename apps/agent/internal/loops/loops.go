package loops

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/proberx/agent/internal/metrics"
)

// RegisterLoop attempts to register the agent with the dashboard up to 5 times.
func RegisterLoop(dashboardUrl, agentId, agentToken, agentHost string) {
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

// HeartbeatLoop sends a heartbeat to the dashboard every 30 seconds.
func HeartbeatLoop(dashboardUrl, agentId string) {
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

// MetricsPushLoop collects and pushes system metrics to the dashboard every 60 seconds.
func MetricsPushLoop(dashboardUrl, agentId string) {
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
