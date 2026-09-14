package tools

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ReconcileAccessWhitelists re-applies the stored firewall state of every
// deployed app and returns the list of failures.
func ReconcileAccessWhitelists() []string {
	entries, err := os.ReadDir(appsDir)
	if err != nil {
		return []string{fmt.Sprintf("read %s: %v", appsDir, err)}
	}
	var failures []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		dir := filepath.Join(appsDir, name)
		if _, err := os.Stat(filepath.Join(dir, "docker-compose.yml")); err != nil {
			continue
		}
		if err := enforceWhitelistState(name, dir); err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", name, err))
		}
	}
	return failures
}

// StartAccessReconciler re-applies every app's access whitelist at start-up
// (retrying while Docker is still coming up) and then periodically.
//
// This is the reboot protection: iptables rules are not persisted on the host,
// so without reconciling, an app that must stay private would silently become
// reachable from the internet after a reboot while the panel kept claiming a
// whitelist was in force.
func StartAccessReconciler(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	go func() {
		deadline := time.Now().Add(3 * time.Minute)
		for {
			failures := ReconcileAccessWhitelists()
			if len(failures) == 0 {
				log.Printf("access reconcile (startup): ok")
				break
			}
			log.Printf("access reconcile (startup) retrying: %s", strings.Join(failures, "; "))
			if time.Now().After(deadline) {
				log.Printf("access reconcile (startup): giving up, periodic loop will keep retrying")
				break
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(10 * time.Second):
			}
		}

		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if failures := ReconcileAccessWhitelists(); len(failures) > 0 {
					log.Printf("access reconcile (periodic) failures: %s", strings.Join(failures, "; "))
				}
			}
		}
	}()
}
