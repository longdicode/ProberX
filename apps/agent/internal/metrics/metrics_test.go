package metrics

import (
	"testing"
)

func TestCollect(t *testing.T) {
	snap, err := Collect()
	if err != nil {
		t.Fatalf("Collect() failed: %v", err)
	}

	if snap.NumCPU == 0 {
		t.Error("NumCPU should be > 0")
	}
	if snap.GoVersion == "" {
		t.Error("GoVersion should not be empty")
	}
	if snap.MemTotal == 0 {
		t.Error("MemTotal should be > 0")
	}
	if snap.DiskTotal == 0 {
		t.Error("DiskTotal should be > 0")
	}
	if snap.CollectedAt == 0 {
		t.Error("CollectedAt should be set")
	}
	t.Logf("CPU: %.2f%%, Mem: %d/%d, Disk: %d/%d, Load: %.2f/%.2f/%.2f, GPU: %s util=%.1f%% mem=%d/%d temp=%.0f",
		snap.CPUPercent, snap.MemUsed, snap.MemTotal,
		snap.DiskUsed, snap.DiskTotal,
		snap.Load1, snap.Load5, snap.Load15,
		snap.GPUName, snap.GPUUtilPercent, snap.GPUMemUsed, snap.GPUMemTotal, snap.GPUTemp)
}
