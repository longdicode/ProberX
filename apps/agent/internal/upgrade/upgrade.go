package upgrade

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Version is set at build time via -ldflags.
// Default "0.0.0-dev" means auto-upgrade is disabled (dev build).
var Version = "0.0.0-dev"

type release struct {
	TagName string  `json:"tag_name"`
	Assets  []asset `json:"assets"`
}

type asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// Start begins the periodic upgrade check loop. Call as a goroutine.
// repo is the GitHub "owner/repo" to check for releases.
// interval is how often to check (e.g. 1h). Pass 0 to use the default (1h).
func Start(repo string, interval time.Duration) {
	if repo == "" {
		log.Println("[upgrade] UPGRADE_REPO not set, auto-update disabled")
		return
	}
	if Version == "0.0.0-dev" {
		log.Println("[upgrade] dev build, auto-update disabled")
		return
	}
	if interval <= 0 {
		interval = 1 * time.Hour
	}

	log.Printf("[upgrade] checking %s every %s (current: %s)", repo, interval, Version)

	time.Sleep(30 * time.Second)
	check(repo)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		check(repo)
	}
}

func check(repo string) {
	latest, err := fetchLatest(repo)
	if err != nil {
		log.Printf("[upgrade] fetch failed: %v", err)
		return
	}

	latestVer := strings.TrimPrefix(latest.TagName, "v")
	if cmp := cmpVersion(latestVer, Version); cmp <= 0 {
		return
	}

	log.Printf("[upgrade] new version v%s available (current: %s)", latestVer, Version)

	downloadURL, checksumURL := findAsset(latest.Assets)
	if downloadURL == "" {
		log.Printf("[upgrade] no asset found for %s/%s", runtime.GOOS, runtime.GOARCH)
		return
	}

	exePath, err := os.Executable()
	if err != nil {
		log.Printf("[upgrade] os.Executable: %v", err)
		return
	}
	tmpFile := filepath.Join(filepath.Dir(exePath), ".agent_upgrade")

	if err := downloadTo(downloadURL, tmpFile); err != nil {
		log.Printf("[upgrade] download: %v", err)
		return
	}

	if checksumURL != "" {
		if err := verifyFile(tmpFile, checksumURL); err != nil {
			log.Printf("[upgrade] checksum: %v", err)
			os.Remove(tmpFile)
			return
		}
	}

	if err := os.Chmod(tmpFile, 0755); err != nil {
		log.Printf("[upgrade] chmod: %v", err)
		os.Remove(tmpFile)
		return
	}

	if err := os.Rename(tmpFile, exePath); err != nil {
		log.Printf("[upgrade] rename: %v", err)
		os.Remove(tmpFile)
		return
	}

	log.Println("[upgrade] upgrade complete, restarting...")
	cmd := exec.Command("systemctl", "restart", "proberx-agent")
	cmd.Stdout = nil
	cmd.Stderr = nil
	_ = cmd.Start()
}

func fetchLatest(repo string) (*release, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repo)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "proberx-agent")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var rel release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &rel, nil
}

func findAsset(assets []asset) (binaryURL, shaURL string) {
	suffix := fmt.Sprintf("_%s_%s", runtime.GOOS, runtime.GOARCH)
	for _, a := range assets {
		if strings.Contains(a.Name, suffix) && strings.HasSuffix(a.Name, ".sha256") {
			shaURL = a.BrowserDownloadURL
		}
		if strings.Contains(a.Name, suffix) && !strings.HasSuffix(a.Name, ".sha256") {
			binaryURL = a.BrowserDownloadURL
		}
	}
	return
}

func downloadTo(url, dst string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("status %d", resp.StatusCode)
	}

	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = io.Copy(f, resp.Body)
	return err
}

func verifyFile(path, checksumURL string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	localSum := hex.EncodeToString(h.Sum(nil))

	resp, err := http.Get(checksumURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	remoteSum, err := io.ReadAll(io.LimitReader(resp.Body, 256))
	if err != nil {
		return err
	}

	remoteSumStr := strings.TrimSpace(string(remoteSum))
	if fields := strings.Fields(remoteSumStr); len(fields) > 0 {
		remoteSumStr = fields[0]
	}

	if !strings.EqualFold(localSum, remoteSumStr) {
		return fmt.Errorf("checksum mismatch: local %s…, remote %s…", localSum[:16], remoteSumStr[:16])
	}
	return nil
}

func cmpVersion(a, b string) int {
	partsA := strings.Split(a, ".")
	partsB := strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		na := partAt(partsA, i)
		nb := partAt(partsB, i)
		if na < nb {
			return -1
		}
		if na > nb {
			return 1
		}
	}
	return 0
}

func partAt(parts []string, i int) int {
	if i >= len(parts) {
		return 0
	}
	n, _ := strconv.Atoi(parts[i])
	return n
}
