package docker

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"runtime"
	"strings"
	"time"
)

type PortMapping struct {
	IP          string `json:"ip"`
	PrivatePort uint16 `json:"private_port"`
	PublicPort  uint16 `json:"public_port"`
	Type        string `json:"type"`
}

type ContainerInfo struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	Image      string        `json:"image"`
	Status     string        `json:"status"`
	State      string        `json:"state"`
	Ports      []PortMapping `json:"ports"`
	CPUPercent float64       `json:"cpu_percent"`
	MemUsage   uint64        `json:"mem_usage"`
	MemLimit   uint64        `json:"mem_limit"`
	MemPercent float64       `json:"mem_percent"`
	Created    int64         `json:"created"`
}

func dockerSocketPath() string {
	if runtime.GOOS == "windows" {
		return "//./pipe/docker_engine"
	}
	return "/var/run/docker.sock"
}

func newDockerClient() *http.Client {
	socketPath := dockerSocketPath()
	return &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "unix", socketPath)
			},
		},
		Timeout: 10 * time.Second,
	}
}

type containerJSON struct {
	ID      string `json:"Id"`
	Name    string `json:"-"`
	Names   []string
	Image   string `json:"Image"`
	Status  string `json:"Status"`
	State   string `json:"State"`
	Created int64  `json:"Created"`
	Ports   []struct {
		IP          string `json:"IP"`
		PrivatePort uint16 `json:"PrivatePort"`
		PublicPort  uint16 `json:"PublicPort"`
		Type        string `json:"Type"`
	} `json:"Ports"`
}

type statsJSON struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     uint32 `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
	} `json:"memory_stats"`
}

func List() ([]ContainerInfo, error) {
	client := newDockerClient()

	resp, err := client.Get("http://unix/containers/json?all=true")
	if err != nil {
		log.Printf("docker: failed to connect to socket: %v", err)
		return []ContainerInfo{}, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("docker: unexpected status %d from /containers/json", resp.StatusCode)
		return []ContainerInfo{}, nil
	}

	var raw []containerJSON
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		log.Printf("docker: failed to parse container list: %v", err)
		return []ContainerInfo{}, nil
	}

	var result []ContainerInfo
	for _, c := range raw {
		id := c.ID
		if len(id) > 12 {
			id = id[:12]
		}
		name := ""
		for _, n := range c.Names {
			name = strings.TrimPrefix(n, "/")
			break
		}

		ci := ContainerInfo{
			ID:      id,
			Name:    name,
			Image:   c.Image,
			Status:  c.Status,
			State:   c.State,
			Created: c.Created,
			Ports:   make([]PortMapping, len(c.Ports)),
		}
		for i, p := range c.Ports {
			ci.Ports[i] = PortMapping{
				IP:          p.IP,
				PrivatePort: p.PrivatePort,
				PublicPort:  p.PublicPort,
				Type:        p.Type,
			}
		}

		if c.State == "running" {
			fetchStats(client, c.ID, &ci)
		}

		result = append(result, ci)
	}
	return result, nil
}

func fetchStats(client *http.Client, fullID string, ci *ContainerInfo) {
	resp, err := client.Get("http://unix/containers/" + fullID + "/stats?stream=false")
	if err != nil {
		log.Printf("docker: stats fetch failed for %s: %v", ci.ID, err)
		return
	}
	defer resp.Body.Close()

	var s statsJSON
	if err := json.NewDecoder(resp.Body).Decode(&s); err != nil {
		log.Printf("docker: stats parse failed for %s: %v", ci.ID, err)
		return
	}

	cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage - s.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(s.CPUStats.SystemCPUUsage - s.PreCPUStats.SystemCPUUsage)
	if systemDelta > 0 && cpuDelta > 0 && s.CPUStats.OnlineCPUs > 0 {
		ci.CPUPercent = (cpuDelta / systemDelta) * float64(s.CPUStats.OnlineCPUs) * 100
	}

	ci.MemUsage = s.MemoryStats.Usage
	ci.MemLimit = s.MemoryStats.Limit
	if ci.MemLimit > 0 {
		ci.MemPercent = float64(ci.MemUsage) / float64(ci.MemLimit) * 100
	}
}
