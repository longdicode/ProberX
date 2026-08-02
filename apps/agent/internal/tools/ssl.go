package tools

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// CheckSSL connects to a domain and retrieves its TLS certificate info.
func CheckSSL(domain string) (*SSLCertInfo, error) {
	host, port := domain, "443"
	if strings.Contains(domain, ":") {
		var p string
		host, p, _ = strings.Cut(domain, ":")
		port = p
	}

	dialer := &net.Dialer{Timeout: 10 * time.Second}
	addr := net.JoinHostPort(host, port)
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
		InsecureSkipVerify: true,
		ServerName:         host,
	})
	if err != nil {
		// Fallback: try localhost for domains pointing to the same machine (hairpin NAT)
		conn2, err2 := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort("127.0.0.1", port), &tls.Config{
			InsecureSkipVerify: true,
			ServerName:         host,
		})
		if err2 != nil {
			return nil, fmt.Errorf("failed to connect to %s: %v", addr, err)
		}
		conn = conn2
	}
	defer conn.Close()

	certs := conn.ConnectionState().PeerCertificates
	if len(certs) == 0 {
		return nil, fmt.Errorf("no certificates found for %s", domain)
	}

	cert := certs[0]
	now := time.Now()
	daysLeft := int(cert.NotAfter.Sub(now).Hours() / 24)

	return &SSLCertInfo{
		Domain:      domain,
		Issuer:      cert.Issuer.CommonName,
		Subject:     cert.Subject.CommonName,
		NotBefore:   cert.NotBefore.Format(time.RFC3339),
		NotAfter:    cert.NotAfter.Format(time.RFC3339),
		DaysLeft:    daysLeft,
		SANs:        strings.Join(cert.DNSNames, ", "),
		Fingerprint: fmt.Sprintf("%x", cert.Signature)[:40],
	}, nil
}

// IssueCert uses certbot to obtain a Let's Encrypt certificate.
func IssueCert(req SSLIssueRequest) (*SSLRenewResult, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("SSL issuance is only supported on Linux")
	}

	webroot := req.Webroot
	if webroot == "" {
		webroot = "/var/www/html"
	}

	os.MkdirAll(webroot, 0755)

	args := []string{"certonly", "--non-interactive", "--agree-tos",
		"-m", req.Email, "-d", req.Domain,
		"--webroot", "-w", webroot}

	cmd := exec.Command("certbot", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return &SSLRenewResult{Success: false, Domain: req.Domain, Output: string(output)}, fmt.Errorf("certbot issue failed: %s", string(output))
	}

	return &SSLRenewResult{Success: true, Domain: req.Domain, Output: string(output)}, nil
}

// RenewCert runs certbot renew for a specific domain or all domains.
func RenewCert(domain string) (*SSLRenewResult, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("SSL renewal is only supported on Linux")
	}

	args := []string{"renew", "--non-interactive"}
	if domain != "" {
		args = append(args, "--cert-name", domain, "--force-renewal")
	}

	cmd := exec.Command("certbot", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return &SSLRenewResult{Success: false, Domain: domain, Output: string(output)}, fmt.Errorf("certbot renew failed: %s", string(output))
	}

	return &SSLRenewResult{Success: true, Domain: domain, Output: string(output)}, nil
}

// ListInstalledCerts scans common certificate locations (BT Panel, certbot)
// and returns certificates already installed on this machine.
func ListInstalledCerts() []InstalledCertInfo {
	var result []InstalledCertInfo
	seen := map[string]bool{}

	// BT Panel (宝塔面板): /www/server/panel/vhost/cert/<domain>/{fullchain.pem,privkey.pem}
	if dirs, err := os.ReadDir("/www/server/panel/vhost/cert"); err == nil {
		for _, d := range dirs {
			if !d.IsDir() {
				continue
			}
			base := filepath.Join("/www/server/panel/vhost/cert", d.Name())
			certPath := filepath.Join(base, "fullchain.pem")
			keyPath := filepath.Join(base, "privkey.pem")
			if info := parseInstalledCert(certPath, keyPath, "bt"); info != nil {
				result = append(result, *info)
				seen[info.Domain] = true
			}
		}
	}

	// certbot: /etc/letsencrypt/live/<domain>/fullchain.pem
	if dirs, err := os.ReadDir("/etc/letsencrypt/live"); err == nil {
		for _, d := range dirs {
			if !d.IsDir() {
				continue
			}
			base := filepath.Join("/etc/letsencrypt/live", d.Name())
			certPath := filepath.Join(base, "fullchain.pem")
			if _, err := os.Stat(certPath); err != nil {
				continue
			}
			keyPath := filepath.Join(base, "privkey.pem")
			if info := parseInstalledCert(certPath, keyPath, "certbot"); info != nil && !seen[info.Domain] {
				result = append(result, *info)
				seen[info.Domain] = true
			}
		}
	}

	return result
}

// parseInstalledCert reads a PEM certificate file and returns its details.
func parseInstalledCert(certPath, keyPath, source string) *InstalledCertInfo {
	data, err := os.ReadFile(certPath)
	if err != nil {
		return nil
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil
	}
	now := time.Now()
	daysLeft := int(cert.NotAfter.Sub(now).Hours() / 24)
	domain := cert.Subject.CommonName
	if domain == "" && len(cert.DNSNames) > 0 {
		domain = cert.DNSNames[0]
	}
	keyFile := keyPath
	if _, err := os.Stat(keyFile); err != nil {
		keyFile = ""
	}
	return &InstalledCertInfo{
		Domain:    domain,
		Issuer:    cert.Issuer.CommonName,
		Subject:   cert.Subject.CommonName,
		NotBefore: cert.NotBefore.Format(time.RFC3339),
		NotAfter:  cert.NotAfter.Format(time.RFC3339),
		DaysLeft:  daysLeft,
		SANs:      strings.Join(cert.DNSNames, ", "),
		CertPath:  certPath,
		KeyPath:   keyFile,
		Source:    source,
	}
}
