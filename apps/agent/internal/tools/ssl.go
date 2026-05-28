package tools

import (
	"crypto/tls"
	"fmt"
	"net"
	"runtime"
	"strconv"
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

var _ = strconv.Itoa
var _ = runtime.GOOS
