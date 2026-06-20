package docker

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
)

// ── Types ──────────────────────────────────────────────────────────────

type ImageInfo struct {
	ID          string   `json:"id"`
	RepoTags    []string `json:"repo_tags"`
	RepoDigests []string `json:"repo_digests"`
	Size        int64    `json:"size"`
	Created     int64    `json:"created"`
	Containers  int      `json:"containers"`
}

type ImagePullResult struct {
	Status string `json:"status"`
	ID     string `json:"id,omitempty"`
	Error  string `json:"error,omitempty"`
}

type ImageInspectInfo struct {
	ID           string            `json:"id"`
	RepoTags     []string          `json:"repo_tags"`
	Size         int64             `json:"size"`
	Created      string            `json:"created"`
	Architecture string            `json:"architecture"`
	OS           string            `json:"os"`
	Author       string            `json:"author"`
	Labels       map[string]string `json:"labels"`
	Env          []string          `json:"env"`
}

type ImagePruneResult struct {
	ImagesDeleted  int   `json:"images_deleted"`
	SpaceReclaimed int64 `json:"space_reclaimed"`
}

// ── Internal Docker API types ─────────────────────────────────────────

type dockerImageJSON struct {
	ID          string   `json:"Id"`
	RepoTags    []string `json:"RepoTags"`
	RepoDigests []string `json:"RepoDigests"`
	Size        int64    `json:"Size"`
	Created     int64    `json:"Created"`
	Containers  int      `json:"Containers"`
}

type dockerImageInspectJSON struct {
	ID           string            `json:"Id"`
	RepoTags     []string          `json:"RepoTags"`
	Size         int64             `json:"Size"`
	Created      string            `json:"Created"`
	Architecture string            `json:"Architecture"`
	OS           string            `json:"Os"`
	Author       string            `json:"Author"`
	Config       *dockerInspectCfg `json:"Config"`
}

type dockerInspectCfg struct {
	Labels map[string]string `json:"Labels"`
	Env    []string          `json:"Env"`
}

type dockerPruneResponse struct {
	ImagesDeleted  []dockerPrunedImage `json:"ImagesDeleted"`
	SpaceReclaimed int64               `json:"SpaceReclaimed"`
}

type dockerPrunedImage struct {
	Deleted string `json:"Deleted"`
	Untagged string `json:"Untagged"`
}

// ── Public API ─────────────────────────────────────────────────────────

// ListImages returns all Docker images.
func ListImages() ([]ImageInfo, error) {
	client := newDockerClient()
	resp, err := client.Get("http://unix/images/json?all=true")
	if err != nil {
		return nil, fmt.Errorf("docker: failed to list images: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("docker: unexpected status %d from /images/json", resp.StatusCode)
	}

	var raw []dockerImageJSON
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("docker: failed to parse image list: %w", err)
	}

	result := make([]ImageInfo, len(raw))
	for i, img := range raw {
		id := img.ID
		if len(id) > 12 {
			id = id[:12] // 12-char short ID without "sha256:"
		}
		if strings.HasPrefix(id, "sha256:") {
			id = id[7:]
			if len(id) > 12 {
				id = id[:12]
			}
		}
		result[i] = ImageInfo{
			ID:          id,
			RepoTags:    img.RepoTags,
			RepoDigests: img.RepoDigests,
			Size:        img.Size,
			Created:     img.Created,
			Containers:  img.Containers,
		}
	}
	return result, nil
}

// PullImage pulls a Docker image from a registry.
// For Docker Hub, use just "name:tag" (e.g., "nginx:latest").
// For other registries, use the full reference (e.g., "ghcr.io/org/image:tag").
func PullImage(name string) (ImagePullResult, error) {
	if name == "" {
		return ImagePullResult{}, fmt.Errorf("docker: image name is required")
	}

	client := newDockerClient()
	url := "http://unix/images/create?fromImage=" + name
	resp, err := client.Post(url, "application/json", nil)
	if err != nil {
		return ImagePullResult{}, fmt.Errorf("docker: failed to pull image %s: %w", name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ImagePullResult{}, fmt.Errorf("docker: pull %s returned status %d", name, resp.StatusCode)
	}

	// Stream JSON lines; return last status or error
	scanner := bufio.NewScanner(resp.Body)
	var lastResult ImagePullResult
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var entry struct {
			Status         string `json:"status"`
			ID             string `json:"id"`
			Error          string `json:"error"`
			ErrorDetail    *struct {
				Message string `json:"message"`
			} `json:"errorDetail"`
		}
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			log.Printf("docker: pull stream parse warning: %v (line: %s)", err, line)
			continue
		}
		if entry.Error != "" || (entry.ErrorDetail != nil && entry.ErrorDetail.Message != "") {
			errMsg := entry.Error
			if errMsg == "" && entry.ErrorDetail != nil {
				errMsg = entry.ErrorDetail.Message
			}
			return ImagePullResult{}, fmt.Errorf("docker: pull %s failed: %s", name, errMsg)
		}
		lastResult = ImagePullResult{
			Status: entry.Status,
			ID:     entry.ID,
		}
	}
	if err := scanner.Err(); err != nil {
		return ImagePullResult{}, fmt.Errorf("docker: pull %s stream error: %w", name, err)
	}
	return lastResult, nil
}

// DeleteImage removes a Docker image by ID or name.
func DeleteImage(id string) error {
	if id == "" {
		return fmt.Errorf("docker: image id is required")
	}

	client := newDockerClient()
	req, err := http.NewRequest("DELETE", "http://unix/images/"+id, nil)
	if err != nil {
		return fmt.Errorf("docker: failed to create delete request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("docker: failed to delete image %s: %w", id, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusConflict {
		return fmt.Errorf("docker: image %s is in use by one or more containers", id)
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("docker: delete %s returned status %d", id, resp.StatusCode)
	}
	return nil
}

// InspectImage returns detailed information about a Docker image.
func InspectImage(id string) (*ImageInspectInfo, error) {
	if id == "" {
		return nil, fmt.Errorf("docker: image id is required")
	}

	client := newDockerClient()
	resp, err := client.Get("http://unix/images/" + id + "/json")
	if err != nil {
		return nil, fmt.Errorf("docker: failed to inspect image %s: %w", id, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("docker: inspect %s returned status %d", id, resp.StatusCode)
	}

	var raw dockerImageInspectJSON
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("docker: failed to parse image inspect for %s: %w", id, err)
	}

	shortID := raw.ID
	if strings.HasPrefix(shortID, "sha256:") {
		shortID = shortID[7:]
	}
	if len(shortID) > 12 {
		shortID = shortID[:12]
	}

	info := &ImageInspectInfo{
		ID:           shortID,
		RepoTags:     raw.RepoTags,
		Size:         raw.Size,
		Created:      raw.Created,
		Architecture: raw.Architecture,
		OS:           raw.OS,
		Author:       raw.Author,
	}
	if raw.Config != nil {
		info.Labels = raw.Config.Labels
		info.Env = raw.Config.Env
	}
	if info.Labels == nil {
		info.Labels = map[string]string{}
	}
	if info.Env == nil {
		info.Env = []string{}
	}
	return info, nil
}

// PruneImages removes all unused (dangling) Docker images.
func PruneImages() (ImagePruneResult, error) {
	client := newDockerClient()
	resp, err := client.Post("http://unix/images/prune", "application/json", nil)
	if err != nil {
		return ImagePruneResult{}, fmt.Errorf("docker: failed to prune images: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ImagePruneResult{}, fmt.Errorf("docker: prune images returned status %d", resp.StatusCode)
	}

	var raw dockerPruneResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return ImagePruneResult{}, fmt.Errorf("docker: failed to parse prune result: %w", err)
	}

	return ImagePruneResult{
		ImagesDeleted:  len(raw.ImagesDeleted),
		SpaceReclaimed: raw.SpaceReclaimed,
	}, nil
}
