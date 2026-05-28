package fileops

import (
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	MaxReadSize   = 10 * 1024 * 1024
	MaxUploadSize = 100 * 1024 * 1024
)

var allowedBasePaths = []string{"/home", "/var", "/etc", "/opt", "/tmp"}

type FileInfo struct {
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	IsDir       bool   `json:"is_dir"`
	ModTime     int64  `json:"mod_time"`
	Permissions string `json:"permissions"`
}

type ReadResult struct {
	Content  string `json:"content"`
	Size     int64  `json:"size"`
	IsBinary bool   `json:"is_binary"`
}

type DeleteRequest struct {
	Path string `json:"path"`
}

type MkdirRequest struct {
	Path string `json:"path"`
}

type RenameRequest struct {
	Path    string `json:"path"`
	NewName string `json:"newName"`
}

func validatePath(p string) (string, error) {
	cleaned := filepath.Clean(p)
	if strings.Contains(cleaned, "..") {
		return "", errors.New("path traversal not allowed")
	}
	abs, err := filepath.Abs(cleaned)
	if err != nil {
		return "", err
	}
	normalized := filepath.ToSlash(abs)
	vol := filepath.VolumeName(abs)
	normalized = strings.TrimPrefix(normalized, vol)
	for _, base := range allowedBasePaths {
		if strings.HasPrefix(normalized, base+"/") || normalized == base {
			return abs, nil
		}
	}
	return "", errors.New("path not allowed")
}

func listAllowedRoots() ([]FileInfo, error) {
	var result []FileInfo
	for _, base := range allowedBasePaths {
		fi, err := os.Stat(base)
		if err != nil {
			continue
		}
		result = append(result, FileInfo{
			Name:        filepath.Base(base),
			Size:        0,
			IsDir:       true,
			ModTime:     fi.ModTime().UnixMilli(),
			Permissions: fi.Mode().String(),
		})
	}
	sort.Slice(result, func(i, j int) bool {
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

func List(p string) ([]FileInfo, error) {
	if p == "/" || p == "" {
		return listAllowedRoots()
	}
	absPath, err := validatePath(p)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(absPath)
	if err != nil {
		return nil, err
	}
	var result []FileInfo
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		result = append(result, FileInfo{
			Name:        entry.Name(),
			Size:        info.Size(),
			IsDir:       entry.IsDir(),
			ModTime:     info.ModTime().UnixMilli(),
			Permissions: info.Mode().String(),
		})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})
	return result, nil
}

func Read(p string) (ReadResult, error) {
	absPath, err := validatePath(p)
	if err != nil {
		return ReadResult{}, err
	}
	fi, err := os.Stat(absPath)
	if err != nil {
		return ReadResult{}, err
	}
	if fi.IsDir() {
		return ReadResult{}, errors.New("cannot read directory as file")
	}
	if fi.Size() > MaxReadSize {
		return ReadResult{}, errors.New("file exceeds max preview size (10MB)")
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		return ReadResult{}, err
	}
	isBinary := false
	checkLen := len(data)
	if checkLen > 512 {
		checkLen = 512
	}
	for i := 0; i < checkLen; i++ {
		if data[i] == 0 {
			isBinary = true
			break
		}
	}
	return ReadResult{
		Content:  string(data),
		Size:     fi.Size(),
		IsBinary: isBinary,
	}, nil
}

func Delete(p string) error {
	absPath, err := validatePath(p)
	if err != nil {
		return err
	}
	return os.RemoveAll(absPath)
}

func Mkdir(p string) error {
	absPath, err := validatePath(p)
	if err != nil {
		return err
	}
	return os.MkdirAll(absPath, 0755)
}

func Rename(p, newName string) error {
	absPath, err := validatePath(p)
	if err != nil {
		return err
	}
	if strings.Contains(newName, "/") || strings.Contains(newName, "\\") {
		return errors.New("new name must not contain path separators")
	}
	if newName == "" {
		return errors.New("new name required")
	}
	destPath := filepath.Join(filepath.Dir(absPath), newName)
	_, err = validatePath(destPath)
	if err != nil {
		return err
	}
	return os.Rename(absPath, destPath)
}

func ServeDownload(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	absPath, err := validatePath(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	fi, err := os.Stat(absPath)
	if err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	if fi.IsDir() {
		http.Error(w, "cannot download directory", http.StatusBadRequest)
		return
	}
	file, err := os.Open(absPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer file.Close()
	w.Header().Set("Content-Disposition", `attachment; filename="`+filepath.Base(absPath)+`"`)
	http.ServeContent(w, r, filepath.Base(absPath), fi.ModTime(), file)
}

func HandleUpload(w http.ResponseWriter, r *http.Request) {
	destPath := r.URL.Query().Get("path")
	if destPath == "" {
		destPath = "/tmp"
	}
	absDest, err := validatePath(destPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "failed to parse multipart form", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file field required", http.StatusBadRequest)
		return
	}
	defer file.Close()
	destFilePath := filepath.Join(absDest, filepath.Base(header.Filename))
	dst, err := os.Create(destFilePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	io.WriteString(w, `{"status":"uploaded"}`)
}
