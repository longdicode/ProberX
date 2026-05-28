package probe

import (
	"testing"
)

func TestExecuteHTTP(t *testing.T) {
	req := Request{
		Type:    "http",
		Target:  "https://httpbin.org/get",
		Timeout: 10_000,
	}
	result := Execute(req)

	if result.ErrorMsg != "" {
		t.Logf("HTTP probe had error (may be offline): %s", result.ErrorMsg)
	}
	if result.ResponseMs == 0 && result.ErrorMsg == "" {
		t.Error("expected either response_ms or error_msg")
	}
}

func TestExecutePing(t *testing.T) {
	req := Request{
		Type:    "ping",
		Target:  "127.0.0.1",
		Timeout: 5_000,
	}
	result := Execute(req)

	if result.ErrorMsg != "" {
		t.Logf("Ping probe had error: %s", result.ErrorMsg)
	}
}

func TestExecuteTCP(t *testing.T) {
	req := Request{
		Type:    "tcp",
		Target:  "httpbin.org:443",
		Timeout: 10_000,
	}
	result := Execute(req)

	if result.ErrorMsg != "" {
		t.Logf("TCP probe had error (may be offline): %s", result.ErrorMsg)
	}
}

func TestExecuteUnknownType(t *testing.T) {
	req := Request{
		Type:    "unknown",
		Target:  "test",
		Timeout: 1_000,
	}
	result := Execute(req)
	if result.ErrorMsg == "" {
		t.Error("expected error for unknown probe type")
	}
}
