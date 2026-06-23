package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ShellAIGenerateRequest holds the LLM config and user prompt.
type ShellAIGenerateRequest struct {
	Prompt   string `json:"prompt"`
	Provider string `json:"provider"` // openai, claude, deepseek, custom
	Model    string `json:"model"`
	APIKey   string `json:"api_key"`
	APIURL   string `json:"api_url,omitempty"`
}

// ShellAIGenerateResponse returns the generated command.
type ShellAIGenerateResponse struct {
	Command     string `json:"command"`
	Explanation string `json:"explanation,omitempty"`
}

// ShellAIExecuteRequest runs a shell command.
type ShellAIExecuteRequest struct {
	Command string `json:"command"`
	Timeout int    `json:"timeout,omitempty"`
}

// ShellAIExecuteResponse returns command output.
type ShellAIExecuteResponse struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

const shellAISystemPrompt = `You are a Linux shell command generator running on the target server.
Convert the user''s natural language request into a safe, correct shell command.

Rules:
- Return ONLY a JSON object: {"command": "...", "explanation": "..."}
- The command must be a single line or use && / ; for multiple steps.
- Never include destructive commands (rm -rf /, dd, mkfs, > /dev/sda, etc.)
- Prefer idempotent, safe operations.
- For diagnostics, use read-only commands (cat, grep, ls, df, free, ps, ss, systemctl status, journalctl, etc.)
- For changes, include safety guards (--dry-run if available, or echo the planned action).
- Adapt to the OS: prefer systemctl over service, apt over yum on Debian/Ubuntu.
- If the request is ambiguous, ask for clarification in the explanation field.`

func ShellAIGenerate(req ShellAIGenerateRequest) (*ShellAIGenerateResponse, error) {
	if req.Prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	if req.Provider == "" {
		req.Provider = "openai"
	}

	switch req.Provider {
	case "claude":
		return callClaudeAPI(req)
	default:
		return callOpenAICompatAPI(req)
	}
}

func callOpenAICompatAPI(req ShellAIGenerateRequest) (*ShellAIGenerateResponse, error) {
	apiURL := req.APIURL
	if apiURL == "" {
		switch req.Provider {
		case "deepseek":
			apiURL = "https://api.deepseek.com/v1"
		case "custom":
			return nil, fmt.Errorf("api_url is required for custom provider")
		default:
			apiURL = "https://api.openai.com/v1"
		}
	}
	if !strings.HasSuffix(apiURL, "/chat/completions") {
		apiURL = strings.TrimRight(apiURL, "/") + "/chat/completions"
	}
	model := req.Model
	if model == "" {
		switch req.Provider {
		case "deepseek":
			model = "deepseek-chat"
		default:
			model = "gpt-4o-mini"
		}
	}

	body := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": shellAISystemPrompt},
			{"role": "user", "content": req.Prompt},
		},
		"max_tokens":  500,
		"temperature": 0.1,
	}
	bodyBytes, _ := json.Marshal(body)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("LLM API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("LLM API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse LLM response: %w (body: %s)", err, string(respBytes[:min(len(respBytes), 200)]))
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("LLM returned no choices")
	}

	content := strings.TrimSpace(result.Choices[0].Message.Content)
	content = stripMarkdownCodeFence(content)

	var gen ShellAIGenerateResponse
	if err := json.Unmarshal([]byte(content), &gen); err != nil {
		gen.Command = content
		gen.Explanation = ""
	}
	return &gen, nil
}

func callClaudeAPI(req ShellAIGenerateRequest) (*ShellAIGenerateResponse, error) {
	apiURL := req.APIURL
	if apiURL == "" {
		apiURL = "https://api.anthropic.com/v1/messages"
	}
	model := req.Model
	if model == "" {
		model = "claude-sonnet-4-6"
	}

	body := map[string]any{
		"model":      model,
		"max_tokens": 500,
		"system":     shellAISystemPrompt,
		"messages": []map[string]string{
			{"role": "user", "content": req.Prompt},
		},
	}
	bodyBytes, _ := json.Marshal(body)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", req.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("Claude API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("Claude API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse Claude response: %w", err)
	}
	if len(result.Content) == 0 {
		return nil, fmt.Errorf("Claude returned no content")
	}

	content := strings.TrimSpace(result.Content[0].Text)
	content = stripMarkdownCodeFence(content)

	var gen ShellAIGenerateResponse
	if err := json.Unmarshal([]byte(content), &gen); err != nil {
		gen.Command = content
		gen.Explanation = ""
	}
	return &gen, nil
}

func ShellAIExecute(req ShellAIExecuteRequest) (*ShellAIExecuteResponse, error) {
	if req.Command == "" {
		return nil, fmt.Errorf("command is required")
	}

	timeout := req.Timeout
	if timeout <= 0 {
		timeout = 30
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bash", "-c", req.Command)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			return nil, fmt.Errorf("command execution failed: %w", err)
		}
	}

	return &ShellAIExecuteResponse{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: exitCode,
	}, nil
}

func stripMarkdownCodeFence(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		if idx := strings.IndexByte(s, '\n'); idx != -1 {
			s = s[idx+1:]
		}
		if strings.HasSuffix(s, "```") {
			s = s[:len(s)-3]
		}
		s = strings.TrimSpace(s)
	}
	return s
}

// --- Shell AI config persistence ---

const shellAIConfigPath = "/opt/proberx/shellai-config.json"

func loadShellAIConfig() (ShellAIConfig, error) {
	var cfg ShellAIConfig
	data, err := os.ReadFile(shellAIConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, fmt.Errorf("failed to read Shell AI config: %w", err)
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("failed to parse Shell AI config: %w", err)
	}
	return cfg, nil
}

func saveShellAIConfig(cfg ShellAIConfig) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal Shell AI config: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(shellAIConfigPath), 0755); err != nil {
		return fmt.Errorf("failed to create config dir: %w", err)
	}
	if err := os.WriteFile(shellAIConfigPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write Shell AI config: %w", err)
	}
	return nil
}

// LoadShellAIConfigPublic returns the Shell AI config with api_key masked.
func LoadShellAIConfigPublic() (ShellAIConfig, error) {
	cfg, err := loadShellAIConfig()
	if err != nil {
		return cfg, err
	}
	if len(cfg.APIKey) > 4 {
		cfg.APIKey = cfg.APIKey[:4] + strings.Repeat("*", len(cfg.APIKey)-4)
	} else if cfg.APIKey != "" {
		cfg.APIKey = strings.Repeat("*", len(cfg.APIKey))
	}
	return cfg, nil
}

// SaveShellAIConfigInternal saves the Shell AI config.
func SaveShellAIConfigInternal(cfg ShellAIConfig) error {
	if cfg.Provider == "" {
		return fmt.Errorf("provider is required")
	}
	return saveShellAIConfig(cfg)
}