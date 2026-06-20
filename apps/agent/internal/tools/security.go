package tools

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

// SSHFinding is a single security audit finding.
type SSHFinding struct {
	Severity string `json:"severity"`
	Key      string `json:"key"`
	Value    string `json:"value"`
	Message  string `json:"message"`
}

// PortScanResult holds nmap scan output.
type PortScanResult struct {
	Target string `json:"target"`
	Output string `json:"output"`
}

// Fail2banJail describes a single fail2ban jail.
type Fail2banJail struct {
	Name      string   `json:"name"`
	Enabled   bool     `json:"enabled"`
	BannedIPs []string `json:"banned_ips"`
	BanCount  int      `json:"ban_count"`
}

func checkSecurityLinux() error {
	if runtime.GOOS == "windows" {
		return fmt.Errorf("security tools are only supported on Linux")
	}
	return nil
}

func AuditSSH() ([]SSHFinding, error) {
	if err := checkSecurityLinux(); err != nil {
		return nil, err
	}

	var findings []SSHFinding

	configPath := "/etc/ssh/sshd_config"
	f, err := os.Open(configPath)
	if err != nil {
		return []SSHFinding{{
			Severity: "critical",
			Key:      "sshd_config",
			Value:    "not found",
			Message:  "SSH daemon config /etc/ssh/sshd_config not found — SSH may not be installed",
		}}, nil
	}
	defer f.Close()

	config := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, " ", 2)
		if len(parts) == 2 {
			config[strings.ToLower(parts[0])] = strings.TrimSpace(parts[1])
		}
	}

	checks := []struct {
		key, badVal, severity, msg string
	}{
		{"permitrootlogin", "yes", "critical", "Root login is permitted — set to 'no' or 'prohibit-password'"},
		{"passwordauthentication", "yes", "high", "Password authentication enabled — use key-based auth instead"},
		{"x11forwarding", "yes", "low", "X11 forwarding enabled — disable if not needed"},
		{"maxauthtries", "6", "medium", "MaxAuthTries is high (6) — consider lowering to 3"},
		{"port", "22", "low", "SSH running on default port 22 — consider changing to a non-standard port"},
		{"protocol", "1", "critical", "SSH Protocol 1 is insecure — use Protocol 2 only"},
	}

	for _, check := range checks {
		val, ok := config[check.key]
		if !ok {
			findings = append(findings, SSHFinding{
				Severity: "info", Key: check.key, Value: "not set",
				Message: fmt.Sprintf("%s not explicitly configured", check.key),
			})
			continue
		}
		if val == check.badVal {
			findings = append(findings, SSHFinding{
				Severity: check.severity, Key: check.key, Value: val, Message: check.msg,
			})
		} else {
			findings = append(findings, SSHFinding{
				Severity: "ok", Key: check.key, Value: val,
				Message: fmt.Sprintf("%s is securely configured", check.key),
			})
		}
	}

	return findings, nil
}

func RunPortScan(target, ports string) (PortScanResult, error) {
	if err := checkSecurityLinux(); err != nil {
		return PortScanResult{Target: target, Output: err.Error()}, err
	}

	if target == "" {
		return PortScanResult{}, fmt.Errorf("target is required (e.g. localhost or 192.168.1.0/24)")
	}
	if ports == "" {
		ports = "1-1024"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "nmap", "-p", ports, "--open", "-T4", target)
	out, err := cmd.CombinedOutput()
	output := string(out)
	if err != nil {
		if ctx.Err() != nil {
			return PortScanResult{Target: target, Output: "Scan timed out"}, nil
		}
		return PortScanResult{Target: target, Output: output}, fmt.Errorf("nmap failed (is it installed?): %s", output)
	}

	return PortScanResult{Target: target, Output: output}, nil
}

func GetFail2banStatus() ([]Fail2banJail, error) {
	if err := checkSecurityLinux(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "fail2ban-client", "status")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("fail2ban not running or not installed: %s", string(out))
	}

	var jails []Fail2banJail
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "|- ") || strings.HasPrefix(line, "`- ") {
			name := strings.TrimPrefix(strings.TrimPrefix(line, "|- "), "`- ")
			name = strings.TrimSpace(strings.SplitN(name, ",", 2)[0])
			if name == "" {
				continue
			}

			jail := Fail2banJail{Name: name, Enabled: true}

			ctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
			cmd2 := exec.CommandContext(ctx2, "fail2ban-client", "status", name)
			out2, err2 := cmd2.CombinedOutput()
			cancel2()

			if err2 == nil {
				jail.BannedIPs = parseFail2banIPs(string(out2))
				jail.BanCount = len(jail.BannedIPs)
			}

			jails = append(jails, jail)
		}
	}

	if len(jails) == 0 {
		jails = append(jails, Fail2banJail{Name: "sshd", Enabled: true})
	}

	return jails, nil
}

func parseFail2banIPs(output string) []string {
	var ips []string
	inBanned := false
	for _, line := range strings.Split(output, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "Banned IP list:") {
			inBanned = true
		}
		if inBanned {
			for _, ip := range strings.Split(strings.TrimPrefix(trimmed, "Banned IP list:"), " ") {
				if ip = strings.TrimSpace(ip); ip != "" {
					ips = append(ips, ip)
				}
			}
		}
	}
	return ips
}

func Fail2banUnban(jail, ip string) (DeployResult, error) {
	if err := checkSecurityLinux(); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}

	if jail == "" {
		jail = "sshd"
	}
	if ip == "" {
		return DeployResult{Success: false}, fmt.Errorf("IP address is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "fail2ban-client", "set", jail, "unbanip", ip)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return DeployResult{Success: false, Output: string(out)},
			fmt.Errorf("unban failed: %s", string(out))
	}

	return DeployResult{Success: true, AppName: ip, Output: fmt.Sprintf("Unbanned %s from %s", ip, jail)}, nil
}

func Fail2banBan(jail, ip string) (DeployResult, error) {
	if err := checkSecurityLinux(); err != nil {
		return DeployResult{Success: false, Output: err.Error()}, err
	}

	if jail == "" {
		jail = "sshd"
	}
	if ip == "" {
		return DeployResult{Success: false}, fmt.Errorf("IP address is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "fail2ban-client", "set", jail, "banip", ip)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return DeployResult{Success: false, Output: string(out)},
			fmt.Errorf("ban failed: %s", string(out))
	}

	return DeployResult{Success: true, AppName: ip, Output: fmt.Sprintf("Banned %s in %s", ip, jail)}, nil
}
