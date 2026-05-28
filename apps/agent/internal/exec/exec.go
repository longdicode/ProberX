package exec

import (
	"context"
	"os/exec"
	"time"
)

type Request struct {
	Command string `json:"command"`
	Timeout int    `json:"timeout_ms"`
}

type Result struct {
	Output   string `json:"output"`
	ExitCode int    `json:"exit_code"`
	Error    string `json:"error,omitempty"`
}

func Run(req Request) Result {
	timeout := time.Duration(req.Timeout) * time.Millisecond
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", req.Command)
	output, err := cmd.CombinedOutput()

	r := Result{Output: string(output)}
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			r.Error = "command timed out"
			r.ExitCode = -1
		} else if exitErr, ok := err.(*exec.ExitError); ok {
			r.ExitCode = exitErr.ExitCode()
		} else {
			r.Error = err.Error()
			r.ExitCode = -1
		}
	}
	return r
}
