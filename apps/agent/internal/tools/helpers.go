package tools

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

// DecodeBody decodes the JSON request body into the given type T.
// Returns a zero value and an error if decoding fails.
func DecodeBody[T any](r *http.Request) (T, error) {
	var v T
	if err := json.NewDecoder(r.Body).Decode(&v); err != nil {
		return v, err
	}
	return v, nil
}

// WriteOK writes a 200 JSON response with the given data.
func WriteOK(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(data)
}

// WriteError writes a JSON error response with the given status code and message.
func WriteError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// ParseTimeout parses the "timeout" query parameter into a time.Duration.
// Returns 30 seconds if the parameter is missing or invalid.
func ParseTimeout(r *http.Request) time.Duration {
	s := r.URL.Query().Get("timeout")
	if s == "" {
		return 30 * time.Second
	}
	if d, err := strconv.Atoi(s); err == nil {
		return time.Duration(d) * time.Second
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return 30 * time.Second
	}
	return d
}
