package gpu

import (
	"bytes"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

type Info struct {
	Name        string  `json:"gpu_name"`
	UtilPercent float64 `json:"gpu_util_percent"`
	MemTotal    uint64  `json:"gpu_mem_total"`
	MemUsed     uint64  `json:"gpu_mem_used"`
	Temp        float64 `json:"gpu_temp"`
}

func findNvidiaSMI() string {
	if runtime.GOOS == "windows" {
		paths := []string{
			`C:\Windows\System32\nvidia-smi.exe`,
			`C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe`,
		}
		for _, p := range paths {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	return "nvidia-smi"
}

func Collect() Info {
	cmd := exec.Command(
		findNvidiaSMI(),
		"--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
		"--format=csv,noheader,nounits",
	)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return Info{}
	}

	line := strings.TrimSpace(out.String())
	if line == "" {
		return Info{}
	}

	parts := strings.SplitN(line, ",", 5)
	if len(parts) < 5 {
		return Info{}
	}

	name := strings.TrimSpace(parts[0])
	util, _ := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	memUsedMB, _ := strconv.ParseUint(strings.TrimSpace(parts[2]), 10, 64)
	memTotalMB, _ := strconv.ParseUint(strings.TrimSpace(parts[3]), 10, 64)
	temp, _ := strconv.ParseFloat(strings.TrimSpace(parts[4]), 64)

	return Info{
		Name:        name,
		UtilPercent: util,
		MemTotal:    memTotalMB * 1024 * 1024,
		MemUsed:     memUsedMB * 1024 * 1024,
		Temp:        temp,
	}
}
