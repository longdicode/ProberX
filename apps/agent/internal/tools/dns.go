package tools

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const dnsConfigPath = "/opt/proberx/dns-config.json"

// ── Provider interface ──────────────────────────────────────────────

// DNSProvider defines the interface for DNS management providers.
type DNSProvider interface {
	ListZones() ([]DNSZone, error)
	ListRecords(zoneId string) ([]DNSRecord, error)
	CreateRecord(zoneId string, req CreateDNSRecordRequest) (*DNSRecord, error)
	UpdateRecord(zoneId, recordId string, req CreateDNSRecordRequest) (*DNSRecord, error)
	DeleteRecord(zoneId, recordId string) error
}

// ── Config persistence ──────────────────────────────────────────────

func loadDNSConfig() (DNSConfig, error) {
	var cfg DNSConfig
	data, err := os.ReadFile(dnsConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, fmt.Errorf("failed to read DNS config: %w", err)
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("failed to parse DNS config: %w", err)
	}
	return cfg, nil
}

func saveDNSConfig(cfg DNSConfig) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal DNS config: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(dnsConfigPath), 0755); err != nil {
		return fmt.Errorf("failed to create config dir: %w", err)
	}
	if err := os.WriteFile(dnsConfigPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write DNS config: %w", err)
	}
	return nil
}

// LoadDNSConfigPublic returns the DNS config with api_secret masked for display.
func LoadDNSConfigPublic() (DNSConfig, error) {
	cfg, err := loadDNSConfig()
	if err != nil {
		return cfg, err
	}
	if len(cfg.ApiSecret) > 4 {
		cfg.ApiSecret = cfg.ApiSecret[:4] + strings.Repeat("*", len(cfg.ApiSecret)-4)
	} else if cfg.ApiSecret != "" {
		cfg.ApiSecret = strings.Repeat("*", len(cfg.ApiSecret))
	}
	return cfg, nil
}

// SaveDNSConfigInternal saves the DNS provider config after validation.
func SaveDNSConfigInternal(cfg DNSConfig) error {
	if cfg.Provider == "" {
		return fmt.Errorf("provider is required")
	}
	if cfg.ApiKey == "" {
		return fmt.Errorf("api_key is required")
	}
	return saveDNSConfig(cfg)
}

// NewDNSProviderFromConfig reads the config and creates the appropriate provider.
func NewDNSProviderFromConfig() (DNSProvider, error) {
	cfg, err := loadDNSConfig()
	if err != nil {
		return nil, err
	}
	if cfg.Provider == "" {
		return nil, fmt.Errorf("DNS provider not configured")
	}
	provider := newProviderFromType(cfg.Provider, cfg.ApiKey, cfg.ApiSecret)
	if provider == nil {
		return nil, fmt.Errorf("unsupported DNS provider: %s", cfg.Provider)
	}
	return provider, nil
}

// newProviderFromType creates a DNSProvider based on the provider name.
func newProviderFromType(provider, apiKey, apiSecret string) DNSProvider {
	switch provider {
	case "cloudflare":
		return &CloudflareProvider{apiKey: apiKey}
	case "dnspod":
		return &DNSPodProvider{apiKey: apiKey}
	case "godaddy":
		return &GoDaddyProvider{apiKey: apiKey, apiSecret: apiSecret}
	case "vercel":
		return &VercelDNSProvider{apiKey: apiKey}
	case "digitalocean":
		return &DigitalOceanDNSProvider{apiKey: apiKey}
	default:
		return nil
	}
}

// ── HTTP helper ─────────────────────────────────────────────────────

func doJSONRequest(method, url string, headers map[string]string, body interface{}) ([]byte, error) {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 {
		return respBody, fmt.Errorf("API error (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	return respBody, nil
}

// ── Cloudflare Provider ─────────────────────────────────────────────

type CloudflareProvider struct {
	apiKey string
}

func (p *CloudflareProvider) request(method, path string, body interface{}) ([]byte, error) {
	headers := map[string]string{
		"Authorization": "Bearer " + p.apiKey,
	}
	return doJSONRequest(method, "https://api.cloudflare.com/client/v4"+path, headers, body)
}

func (p *CloudflareProvider) parseResponse(data []byte) (map[string]interface{}, error) {
	var res struct {
		Success  bool                   `json:"success"`
		Errors   []interface{}          `json:"errors"`
		Messages []interface{}          `json:"messages"`
		Result   []interface{}          `json:"result"`
		ResultInfo map[string]interface{} `json:"result_info"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse Cloudflare response: %w", err)
	}
	if !res.Success {
		return nil, fmt.Errorf("Cloudflare API error: %s", string(data))
	}
	return map[string]interface{}{"result": res.Result}, nil
}

func (p *CloudflareProvider) ListZones() ([]DNSZone, error) {
	data, err := p.request("GET", "/zones", nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		Result []struct {
			Id     string `json:"id"`
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"result"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse zones: %w", err)
	}
	var zones []DNSZone
	for _, z := range res.Result {
		zones = append(zones, DNSZone{
			Id:     z.Id,
			Name:   z.Name,
			Status: z.Status,
		})
	}
	return zones, nil
}

func (p *CloudflareProvider) ListRecords(zoneId string) ([]DNSRecord, error) {
	data, err := p.request("GET", "/zones/"+zoneId+"/dns_records", nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		Result []struct {
			Id       string      `json:"id"`
			Name     string      `json:"name"`
			Type     string      `json:"type"`
			Content  string      `json:"content"`
			TTL      int         `json:"ttl"`
			Priority json.Number `json:"priority"`
		} `json:"result"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse records: %w", err)
	}
	var records []DNSRecord
	for _, r := range res.Result {
		pri, _ := r.Priority.Int64()
		records = append(records, DNSRecord{
			Id:       r.Id,
			Name:     r.Name,
			Type:     r.Type,
			Content:  r.Content,
			TTL:      r.TTL,
			Priority: int(pri),
		})
	}
	return records, nil
}

func (p *CloudflareProvider) CreateRecord(zoneId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	body := map[string]interface{}{
		"type":    req.Type,
		"name":    req.Name,
		"content": req.Content,
		"ttl":     req.TTL,
	}
	if req.Priority > 0 {
		body["priority"] = req.Priority
	}
	data, err := p.request("POST", "/zones/"+zoneId+"/dns_records", body)
	if err != nil {
		return nil, err
	}
	var res struct {
		Result struct {
			Id       string      `json:"id"`
			Name     string      `json:"name"`
			Type     string      `json:"type"`
			Content  string      `json:"content"`
			TTL      int         `json:"ttl"`
			Priority json.Number `json:"priority"`
		} `json:"result"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse created record: %w", err)
	}
	pri, _ := res.Result.Priority.Int64()
	return &DNSRecord{
		Id:       res.Result.Id,
		Name:     res.Result.Name,
		Type:     res.Result.Type,
		Content:  res.Result.Content,
		TTL:      res.Result.TTL,
		Priority: int(pri),
	}, nil
}

func (p *CloudflareProvider) UpdateRecord(zoneId, recordId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	body := map[string]interface{}{
		"type":    req.Type,
		"name":    req.Name,
		"content": req.Content,
		"ttl":     req.TTL,
	}
	if req.Priority > 0 {
		body["priority"] = req.Priority
	}
	data, err := p.request("PUT", "/zones/"+zoneId+"/dns_records/"+recordId, body)
	if err != nil {
		return nil, err
	}
	var res struct {
		Result struct {
			Id       string      `json:"id"`
			Name     string      `json:"name"`
			Type     string      `json:"type"`
			Content  string      `json:"content"`
			TTL      int         `json:"ttl"`
			Priority json.Number `json:"priority"`
		} `json:"result"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse updated record: %w", err)
	}
	pri, _ := res.Result.Priority.Int64()
	return &DNSRecord{
		Id:       res.Result.Id,
		Name:     res.Result.Name,
		Type:     res.Result.Type,
		Content:  res.Result.Content,
		TTL:      res.Result.TTL,
		Priority: int(pri),
	}, nil
}

func (p *CloudflareProvider) DeleteRecord(zoneId, recordId string) error {
	_, err := p.request("DELETE", "/zones/"+zoneId+"/dns_records/"+recordId, nil)
	return err
}

// ── DNSPod Provider ─────────────────────────────────────────────────

type DNSPodProvider struct {
	apiKey string
}

// loginToken returns the full login_token string.
// apiKey format is "id,token" or just "token".
func (p *DNSPodProvider) request(method, action string, params map[string]string) ([]byte, error) {
	form := url.Values{}
	form.Set("login_token", p.apiKey)
	form.Set("format", "json")
	if strings.Contains(action, "?") {
		// action already has query string
	} else {
		for k, v := range params {
			form.Set(k, v)
		}
	}

	req, err := http.NewRequest("POST", "https://dnsapi.cn/"+action, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP request failed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return data, fmt.Errorf("DNSPod API error (HTTP %d): %s", resp.StatusCode, string(data))
	}

	// Check for API-level error
	var status struct {
		Status struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"status"`
	}
	if err := json.Unmarshal(data, &status); err == nil {
		if status.Status.Code != "1" {
			return data, fmt.Errorf("DNSPod error %s: %s", status.Status.Code, status.Status.Message)
		}
	}

	return data, nil
}

func (p *DNSPodProvider) ListZones() ([]DNSZone, error) {
	data, err := p.request("POST", "Domain.List", nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		Domains []struct {
			Id     int    `json:"id"`
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"domains"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse domains: %w", err)
	}
	var zones []DNSZone
	for _, d := range res.Domains {
		s := "active"
		if d.Status != "enable" {
			s = d.Status
		}
		zones = append(zones, DNSZone{
			Id:     strconv.Itoa(d.Id),
			Name:   d.Name,
			Status: s,
		})
	}
	return zones, nil
}

func (p *DNSPodProvider) ListRecords(zoneId string) ([]DNSRecord, error) {
	// DNSPod Record.List takes the domain name, not the numeric ID
	// First get the domain name from the ID if needed
	domain := zoneId
	if _, err := strconv.Atoi(zoneId); err == nil {
		// zoneId looks like a numeric ID, fetch domain name
		zones, err := p.ListZones()
		if err != nil {
			return nil, err
		}
		for _, z := range zones {
			if z.Id == zoneId {
				domain = z.Name
				break
			}
		}
	}

	data, err := p.request("POST", "Record.List", map[string]string{"domain": domain})
	if err != nil {
		return nil, err
	}
	var res struct {
		Records []struct {
			Id       int    `json:"id"`
			Name     string `json:"name"`
			Type     string `json:"type"`
			Value    string `json:"value"`
			TTL      string `json:"ttl"`
			Priority string `json:"priority,omitempty"`
		} `json:"records"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse records: %w", err)
	}
	var records []DNSRecord
	for _, r := range res.Records {
		ttl, _ := strconv.Atoi(r.TTL)
		pri, _ := strconv.Atoi(r.Priority)
		records = append(records, DNSRecord{
			Id:       strconv.Itoa(r.Id),
			Name:     r.Name,
			Type:     r.Type,
			Content:  r.Value,
			TTL:      ttl,
			Priority: pri,
		})
	}
	return records, nil
}

func (p *DNSPodProvider) CreateRecord(zoneId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	domain := zoneId
	params := map[string]string{
		"domain":      domain,
		"sub_domain":  req.Name,
		"record_type": req.Type,
		"value":       req.Content,
		"record_line": "默认",
	}
	if req.TTL > 0 {
		params["ttl"] = strconv.Itoa(req.TTL)
	}
	if req.Priority > 0 {
		params["priority"] = strconv.Itoa(req.Priority)
	}
	if req.Type == "MX" && req.Priority == 0 {
		params["priority"] = "10"
	}

	data, err := p.request("POST", "Record.Create", params)
	if err != nil {
		return nil, err
	}
	var res struct {
		Record struct {
			Id int `json:"id"`
		} `json:"record"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse created record: %w", err)
	}
	return &DNSRecord{
		Id:       strconv.Itoa(res.Record.Id),
		Name:     req.Name,
		Type:     req.Type,
		Content:  req.Content,
		TTL:      req.TTL,
		Priority: req.Priority,
	}, nil
}

func (p *DNSPodProvider) UpdateRecord(zoneId, recordId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	domain := zoneId
	params := map[string]string{
		"domain":      domain,
		"record_id":   recordId,
		"sub_domain":  req.Name,
		"record_type": req.Type,
		"value":       req.Content,
		"record_line": "默认",
	}
	if req.TTL > 0 {
		params["ttl"] = strconv.Itoa(req.TTL)
	}
	if req.Priority > 0 {
		params["priority"] = strconv.Itoa(req.Priority)
	}

	_, err := p.request("POST", "Record.Modify", params)
	if err != nil {
		return nil, err
	}
	return &DNSRecord{
		Id:       recordId,
		Name:     req.Name,
		Type:     req.Type,
		Content:  req.Content,
		TTL:      req.TTL,
		Priority: req.Priority,
	}, nil
}

func (p *DNSPodProvider) DeleteRecord(zoneId, recordId string) error {
	domain := zoneId
	_, err := p.request("POST", "Record.Remove", map[string]string{
		"domain":    domain,
		"record_id": recordId,
	})
	return err
}

// ── GoDaddy Provider ────────────────────────────────────────────────

type GoDaddyProvider struct {
	apiKey    string
	apiSecret string
}

func (p *GoDaddyProvider) request(method, path string, body interface{}) ([]byte, error) {
	headers := map[string]string{
		"Authorization": "sso-key " + p.apiKey + ":" + p.apiSecret,
	}
	url := "https://api.godaddy.com/v1" + path
	if method == "PATCH" {
		return doJSONRequest(method, url, headers, body)
	}
	return doJSONRequest(method, url, headers, body)
}

func (p *GoDaddyProvider) ListZones() ([]DNSZone, error) {
	data, err := p.request("GET", "/domains", nil)
	if err != nil {
		return nil, err
	}
	var domains []struct {
		DomainId string `json:"domainId"`
		Domain   string `json:"domain"`
		Status   string `json:"status"`
	}
	if err := json.Unmarshal(data, &domains); err != nil {
		return nil, fmt.Errorf("failed to parse domains: %w", err)
	}
	var zones []DNSZone
	for _, d := range domains {
		zones = append(zones, DNSZone{
			Id:     d.Domain,
			Name:   d.Domain,
			Status: d.Status,
		})
	}
	return zones, nil
}

func (p *GoDaddyProvider) ListRecords(zoneId string) ([]DNSRecord, error) {
	data, err := p.request("GET", "/domains/"+zoneId+"/records", nil)
	if err != nil {
		return nil, err
	}
	var records []struct {
		Name     string `json:"name"`
		Type     string `json:"type"`
		Data     string `json:"data"`
		TTL      int    `json:"ttl"`
		Priority int    `json:"priority"`
	}
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, fmt.Errorf("failed to parse records: %w", err)
	}
	var result []DNSRecord
	for _, r := range records {
		// GoDaddy records don't have a unique ID, synthesize one from type+name
		recId := r.Type + ":" + r.Name
		result = append(result, DNSRecord{
			Id:       recId,
			Name:     r.Name,
			Type:     r.Type,
			Content:  r.Data,
			TTL:      r.TTL,
			Priority: r.Priority,
		})
	}
	return result, nil
}

func (p *GoDaddyProvider) CreateRecord(zoneId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	// GoDaddy uses PATCH to add records
	recs := []map[string]interface{}{
		{
			"type": req.Type,
			"name": req.Name,
			"data": req.Content,
			"ttl":  req.TTL,
		},
	}
	if req.Priority > 0 {
		recs[0]["priority"] = req.Priority
	}
	_, err := p.request("PATCH", "/domains/"+zoneId+"/records", recs)
	if err != nil {
		return nil, err
	}
	recId := req.Type + ":" + req.Name
	return &DNSRecord{
		Id:       recId,
		Name:     req.Name,
		Type:     req.Type,
		Content:  req.Content,
		TTL:      req.TTL,
		Priority: req.Priority,
	}, nil
}

func (p *GoDaddyProvider) UpdateRecord(zoneId, recordId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	// For GoDaddy, update by type:name composite
	parts := strings.SplitN(recordId, ":", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid GoDaddy record ID format, expected type:name")
	}
	recType := parts[0]
	recName := parts[1]

	// GoDaddy uses PUT to replace records of a specific type+name
	recs := []map[string]interface{}{
		{
			"data": req.Content,
			"ttl":  req.TTL,
		},
	}
	if req.Priority > 0 {
		recs[0]["priority"] = req.Priority
	}
	_, err := p.request("PUT", "/domains/"+zoneId+"/records/"+recType+"/"+recName, recs)
	if err != nil {
		return nil, err
	}
	return &DNSRecord{
		Id:       recordId,
		Name:     req.Name,
		Type:     req.Type,
		Content:  req.Content,
		TTL:      req.TTL,
		Priority: req.Priority,
	}, nil
}

func (p *GoDaddyProvider) DeleteRecord(zoneId, recordId string) error {
	parts := strings.SplitN(recordId, ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid GoDaddy record ID format, expected type:name")
	}
	_, err := p.request("DELETE", "/domains/"+zoneId+"/records/"+parts[0]+"/"+parts[1], nil)
	return err
}

// ── Vercel DNS Provider ─────────────────────────────────────────────

type VercelDNSProvider struct {
	apiKey string
}

func (p *VercelDNSProvider) request(method, path string, body interface{}) ([]byte, error) {
	headers := map[string]string{
		"Authorization": "Bearer " + p.apiKey,
	}
	return doJSONRequest(method, "https://api.vercel.com"+path, headers, body)
}

func (p *VercelDNSProvider) parseResult(data []byte) (map[string]interface{}, error) {
	var res map[string]interface{}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse Vercel response: %w", err)
	}
	if errMsg, ok := res["error"]; ok {
		return nil, fmt.Errorf("Vercel API error: %v", errMsg)
	}
	return res, nil
}

func (p *VercelDNSProvider) ListZones() ([]DNSZone, error) {
	data, err := p.request("GET", "/v1/domains", nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		Domains []struct {
			Id       string `json:"id"`
			Name     string `json:"name"`
			Verified bool   `json:"verified"`
		} `json:"domains"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse domains: %w", err)
	}
	var zones []DNSZone
	for _, d := range res.Domains {
		status := "active"
		if !d.Verified {
			status = "pending"
		}
		zones = append(zones, DNSZone{
			Id:     d.Name,
			Name:   d.Name,
			Status: status,
		})
	}
	return zones, nil
}

func (p *VercelDNSProvider) ListRecords(zoneId string) ([]DNSRecord, error) {
	data, err := p.request("GET", "/v1/domains/"+zoneId+"/records", nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		Records []struct {
			Id       string `json:"id"`
			Name     string `json:"name"`
			Type     string `json:"type"`
			Value    string `json:"value"`
			TTL      int    `json:"ttl"`
			Priority int    `json:"priority"`
		} `json:"records"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse records: %w", err)
	}
	var records []DNSRecord
	for _, r := range res.Records {
		records = append(records, DNSRecord{
			Id:       r.Id,
			Name:     r.Name,
			Type:     r.Type,
			Content:  r.Value,
			TTL:      r.TTL,
			Priority: r.Priority,
		})
	}
	return records, nil
}

func (p *VercelDNSProvider) CreateRecord(zoneId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	body := map[string]interface{}{
		"name":  req.Name,
		"type":  req.Type,
		"value": req.Content,
		"ttl":   req.TTL,
	}
	if req.Priority > 0 {
		body["priority"] = req.Priority
	}
	data, err := p.request("POST", "/v1/domains/"+zoneId+"/records", body)
	if err != nil {
		return nil, err
	}
	var res struct {
		Record struct {
			Id string `json:"id"`
		} `json:"record"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse created record: %w", err)
	}
	return &DNSRecord{
		Id:       res.Record.Id,
		Name:     req.Name,
		Type:     req.Type,
		Content:  req.Content,
		TTL:      req.TTL,
		Priority: req.Priority,
	}, nil
}

func (p *VercelDNSProvider) UpdateRecord(zoneId, recordId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	body := map[string]interface{}{
		"name":  req.Name,
		"type":  req.Type,
		"value": req.Content,
		"ttl":   req.TTL,
	}
	if req.Priority > 0 {
		body["priority"] = req.Priority
	}
	_, err := p.request("PATCH", "/v1/domains/"+zoneId+"/records/"+recordId, body)
	if err != nil {
		return nil, err
	}
	return &DNSRecord{
		Id:       recordId,
		Name:     req.Name,
		Type:     req.Type,
		Content:  req.Content,
		TTL:      req.TTL,
		Priority: req.Priority,
	}, nil
}

func (p *VercelDNSProvider) DeleteRecord(zoneId, recordId string) error {
	_, err := p.request("DELETE", "/v1/domains/"+zoneId+"/records/"+recordId, nil)
	return err
}

// ── DigitalOcean DNS Provider ───────────────────────────────────────

type DigitalOceanDNSProvider struct {
	apiKey string
}

func (p *DigitalOceanDNSProvider) request(method, path string, body interface{}) ([]byte, error) {
	headers := map[string]string{
		"Authorization": "Bearer " + p.apiKey,
	}
	return doJSONRequest(method, "https://api.digitalocean.com/v2"+path, headers, body)
}

func (p *DigitalOceanDNSProvider) ListZones() ([]DNSZone, error) {
	data, err := p.request("GET", "/domains", nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		Domains []struct {
			Name   string `json:"name"`
			Status string `json:"status"`
		} `json:"domains"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse domains: %w", err)
	}
	var zones []DNSZone
	for _, d := range res.Domains {
		zones = append(zones, DNSZone{
			Id:     d.Name,
			Name:   d.Name,
			Status: d.Status,
		})
	}
	return zones, nil
}

func (p *DigitalOceanDNSProvider) ListRecords(zoneId string) ([]DNSRecord, error) {
	data, err := p.request("GET", "/domains/"+zoneId+"/records", nil)
	if err != nil {
		return nil, err
	}
	var res struct {
		DomainRecords []struct {
			Id       int    `json:"id"`
			Name     string `json:"name"`
			Type     string `json:"type"`
			Data     string `json:"data"`
			TTL      int    `json:"ttl"`
			Priority int    `json:"priority"`
		} `json:"domain_records"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse records: %w", err)
	}
	var records []DNSRecord
	for _, r := range res.DomainRecords {
		records = append(records, DNSRecord{
			Id:       strconv.Itoa(r.Id),
			Name:     r.Name,
			Type:     r.Type,
			Content:  r.Data,
			TTL:      r.TTL,
			Priority: r.Priority,
		})
	}
	return records, nil
}

func (p *DigitalOceanDNSProvider) CreateRecord(zoneId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	body := map[string]interface{}{
		"type": req.Type,
		"name": req.Name,
		"data": req.Content,
		"ttl":  req.TTL,
	}
	if req.Priority > 0 {
		body["priority"] = req.Priority
	}
	data, err := p.request("POST", "/domains/"+zoneId+"/records", body)
	if err != nil {
		return nil, err
	}
	var res struct {
		DomainRecord struct {
			Id       int    `json:"id"`
			Name     string `json:"name"`
			Type     string `json:"type"`
			Data     string `json:"data"`
			TTL      int    `json:"ttl"`
			Priority int    `json:"priority"`
		} `json:"domain_record"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse created record: %w", err)
	}
	return &DNSRecord{
		Id:       strconv.Itoa(res.DomainRecord.Id),
		Name:     res.DomainRecord.Name,
		Type:     res.DomainRecord.Type,
		Content:  res.DomainRecord.Data,
		TTL:      res.DomainRecord.TTL,
		Priority: res.DomainRecord.Priority,
	}, nil
}

func (p *DigitalOceanDNSProvider) UpdateRecord(zoneId, recordId string, req CreateDNSRecordRequest) (*DNSRecord, error) {
	body := map[string]interface{}{
		"type": req.Type,
		"name": req.Name,
		"data": req.Content,
		"ttl":  req.TTL,
	}
	if req.Priority > 0 {
		body["priority"] = req.Priority
	}
	data, err := p.request("PUT", "/domains/"+zoneId+"/records/"+recordId, body)
	if err != nil {
		return nil, err
	}
	var res struct {
		DomainRecord struct {
			Id       int    `json:"id"`
			Name     string `json:"name"`
			Type     string `json:"type"`
			Data     string `json:"data"`
			TTL      int    `json:"ttl"`
			Priority int    `json:"priority"`
		} `json:"domain_record"`
	}
	if err := json.Unmarshal(data, &res); err != nil {
		return nil, fmt.Errorf("failed to parse updated record: %w", err)
	}
	return &DNSRecord{
		Id:       strconv.Itoa(res.DomainRecord.Id),
		Name:     res.DomainRecord.Name,
		Type:     res.DomainRecord.Type,
		Content:  res.DomainRecord.Data,
		TTL:      res.DomainRecord.TTL,
		Priority: res.DomainRecord.Priority,
	}, nil
}

func (p *DigitalOceanDNSProvider) DeleteRecord(zoneId, recordId string) error {
	_, err := p.request("DELETE", "/domains/"+zoneId+"/records/"+recordId, nil)
	return err
}
