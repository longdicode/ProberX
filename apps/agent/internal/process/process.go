package process

import (
	"sort"

	"github.com/shirou/gopsutil/v3/process"
)

type ProcessInfo struct {
	PID   int32   `json:"pid"`
	Name  string  `json:"name"`
	CPU   float64 `json:"cpu_percent"`
	MemMB float64 `json:"mem_mb"`
}

func List(limit int) ([]ProcessInfo, error) {
	procs, err := process.Processes()
	if err != nil {
		return nil, err
	}

	var result []ProcessInfo
	for _, p := range procs {
		name, _ := p.Name()
		cpu, _ := p.CPUPercent()
		mem, _ := p.MemoryInfo()

		if name == "" {
			continue
		}

		memMB := float64(0)
		if mem != nil {
			memMB = float64(mem.RSS) / 1024 / 1024
		}

		result = append(result, ProcessInfo{
			PID:   p.Pid,
			Name:  name,
			CPU:   cpu,
			MemMB: memMB,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].CPU > result[j].CPU
	})

	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}
	return result, nil
}
