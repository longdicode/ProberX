package metrics

import (
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"

	"github.com/proberx/agent/internal/gpu"
)

type Snapshot struct {
	CPUPercent  float64 `json:"cpu_percent"`
	MemTotal    uint64  `json:"mem_total"`
	MemUsed     uint64  `json:"mem_used"`
	DiskTotal   uint64  `json:"disk_total"`
	DiskUsed    uint64  `json:"disk_used"`
	NetInBytes  uint64  `json:"net_in_bytes"`
	NetOutBytes uint64  `json:"net_out_bytes"`
	Load1       float64 `json:"load_1"`
	Load5       float64 `json:"load_5"`
	Load15         float64 `json:"load_15"`
	GPUName        string  `json:"gpu_name"`
	GPUUtilPercent float64 `json:"gpu_util_percent"`
	GPUMemTotal    uint64  `json:"gpu_mem_total"`
	GPUMemUsed     uint64  `json:"gpu_mem_used"`
	GPUTemp        float64 `json:"gpu_temp"`
	NumCPU         int     `json:"num_cpu"`
	GoVersion   string  `json:"go_version"`
	CollectedAt int64   `json:"collected_at"`
}

func Collect() (*Snapshot, error) {
	s := &Snapshot{
		GoVersion:   runtime.Version(),
		NumCPU:      runtime.NumCPU(),
		CollectedAt: time.Now().UnixMilli(),
	}

	if pct, err := cpu.Percent(time.Second, false); err == nil && len(pct) > 0 {
		s.CPUPercent = pct[0]
	}

	if m, err := mem.VirtualMemory(); err == nil {
		s.MemTotal = m.Total
		s.MemUsed = m.Used
	}

	if d, err := disk.Usage("/"); err == nil {
		s.DiskTotal = d.Total
		s.DiskUsed = d.Used
	}

	if n, err := net.IOCounters(false); err == nil && len(n) > 0 {
		s.NetInBytes = n[0].BytesRecv
		s.NetOutBytes = n[0].BytesSent
	}

	if l, err := load.Avg(); err == nil {
		s.Load1 = l.Load1
		s.Load5 = l.Load5
		s.Load15 = l.Load15
	}

	g := gpu.Collect()
	s.GPUName = g.Name
	s.GPUUtilPercent = g.UtilPercent
	s.GPUMemTotal = g.MemTotal
	s.GPUMemUsed = g.MemUsed
	s.GPUTemp = g.Temp

	return s, nil
}
