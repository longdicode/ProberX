package probe

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

type Type string

const (
	TypeHTTP Type = "http"
	TypeTCP  Type = "tcp"
	TypeDNS  Type = "dns"
	TypeSSL  Type = "ssl"
	TypePing Type = "ping"
	TypeGRPC Type = "grpc"
)

type Request struct {
	Type    Type   `json:"type"`
	Target  string `json:"target"`
	Timeout int    `json:"timeout_ms"`
}

type Result struct {
	Success    bool   `json:"is_success"`
	ResponseMs int64  `json:"response_ms"`
	StatusCode int   `json:"status_code,omitempty"`
	ErrorMsg   string `json:"error_msg,omitempty"`
	Detail     any    `json:"detail,omitempty"`
}

func Execute(req Request) Result {
	timeout := time.Duration(req.Timeout) * time.Millisecond
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	switch req.Type {
	case TypeHTTP:
		return probeHTTP(ctx, req.Target)
	case TypeTCP:
		return probeTCP(ctx, req.Target)
	case TypeDNS:
		return probeDNS(ctx, req.Target)
	case TypeSSL:
		return probeSSL(ctx, req.Target)
	case TypePing:
		return probePing(ctx, req.Target)
	case TypeGRPC:
		return probeGRPC(ctx, req.Target)
	default:
		return Result{Success: false, ErrorMsg: "unknown probe type: " + string(req.Type)}
	}
}

func probeHTTP(ctx context.Context, target string) Result {
	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return Result{Success: false, ErrorMsg: err.Error()}
	}

	client := &http.Client{Timeout: 0}
	resp, err := client.Do(req)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Success: false, ResponseMs: elapsed, ErrorMsg: err.Error()}
	}
	defer resp.Body.Close()

	detail := map[string]any{
		"status":      resp.Status,
		"proto":       resp.Proto,
		"content_len": resp.ContentLength,
	}
	return Result{Success: resp.StatusCode < 500, ResponseMs: elapsed, StatusCode: resp.StatusCode, Detail: detail}
}

func probeTCP(ctx context.Context, target string) Result {
	start := time.Now()
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", target)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Success: false, ResponseMs: elapsed, ErrorMsg: err.Error()}
	}
	conn.Close()
	return Result{Success: true, ResponseMs: elapsed}
}

func probeDNS(ctx context.Context, target string) Result {
	start := time.Now()
	var r net.Resolver
	ips, err := r.LookupHost(ctx, target)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Success: false, ResponseMs: elapsed, ErrorMsg: err.Error()}
	}
	return Result{Success: true, ResponseMs: elapsed, Detail: map[string]any{"ips": ips}}
}

func probeSSL(ctx context.Context, target string) Result {
	start := time.Now()
	d := tls.Dialer{Config: &tls.Config{InsecureSkipVerify: false}}
	conn, err := d.DialContext(ctx, "tcp", ensurePort(target, "443"))
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return Result{Success: false, ResponseMs: elapsed, ErrorMsg: err.Error()}
	}
	defer conn.Close()

	tlsConn, ok := conn.(*tls.Conn)
	if !ok {
		return Result{Success: false, ResponseMs: elapsed, ErrorMsg: "not a TLS connection"}
	}
	certs := tlsConn.ConnectionState().PeerCertificates
	detail := map[string]any{}
	if len(certs) > 0 {
		c := certs[0]
		detail["subject"] = c.Subject.String()
		detail["issuer"] = c.Issuer.String()
		detail["not_after"] = c.NotAfter.Format(time.RFC3339)
		detail["dns_names"] = c.DNSNames
	}
	return Result{Success: true, ResponseMs: elapsed, Detail: detail}
}

func probePing(ctx context.Context, target string) Result {
	start := time.Now()
	deadline, ok := ctx.Deadline()
	deadlineSec := 5
	if ok {
		deadlineSec = int(time.Until(deadline).Seconds())
		if deadlineSec < 1 {
			deadlineSec = 1
		}
	}

	host := target
	if h, _, err := net.SplitHostPort(target); err == nil {
		host = h
	}

	cmd := exec.CommandContext(ctx,
		"ping", "-c", "1", "-W", fmt.Sprintf("%d", deadlineSec), host,
	)
	output, err := cmd.CombinedOutput()
	elapsed := time.Since(start).Milliseconds()

	detail := map[string]any{"output": strings.TrimSpace(string(output))}
	return Result{Success: err == nil, ResponseMs: elapsed, Detail: detail}
}

func probeGRPC(ctx context.Context, target string) Result {
	start := time.Now()
	target = ensurePort(target, "443")

	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", target)
	if err != nil {
		return Result{Success: false, ResponseMs: time.Since(start).Milliseconds(), ErrorMsg: err.Error()}
	}
	defer conn.Close()

	conn.SetDeadline(time.Now().Add(10 * time.Second))

	// HTTP/2 connection preface
	preface := []byte("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n")
	if _, err := conn.Write(preface); err != nil {
		return Result{Success: false, ResponseMs: time.Since(start).Milliseconds(), ErrorMsg: "failed to send HTTP/2 preface: " + err.Error()}
	}

	// Read SETTINGS frame header (9 bytes minimum)
	buf := make([]byte, 9)
	n, err := conn.Read(buf)
	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		return Result{Success: false, ResponseMs: elapsed, ErrorMsg: "no HTTP/2 response: " + err.Error()}
	}

	if n < 9 {
		return Result{Success: false, ResponseMs: elapsed, ErrorMsg: fmt.Sprintf("short response: %d bytes", n)}
	}

	// SETTINGS frame type = 0x04
	frameType := buf[3]
	if frameType != 0x04 {
		return Result{Success: false, ResponseMs: elapsed, ErrorMsg: fmt.Sprintf("expected SETTINGS frame (0x04), got 0x%02x", frameType)}
	}

	return Result{Success: true, ResponseMs: elapsed, Detail: map[string]any{"protocol": "HTTP/2", "frame": "SETTINGS"}}
}

func ensurePort(target, defaultPort string) string {
	if _, _, err := net.SplitHostPort(target); err != nil {
		return net.JoinHostPort(target, defaultPort)
	}
	return target
}
