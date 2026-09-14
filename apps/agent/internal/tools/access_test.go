package tools

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// stubDocker replaces the docker CLI with a fake for the duration of a test.
func stubDocker(t *testing.T, fn func(ctx context.Context, args ...string) ([]byte, error)) {
	t.Helper()
	old := dockerCmdFunc
	dockerCmdFunc = fn
	t.Cleanup(func() { dockerCmdFunc = old })
}

func writeApp(t *testing.T, name, compose, env string) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if compose != "" {
		if err := os.WriteFile(filepath.Join(dir, "docker-compose.yml"), []byte(compose), 0644); err != nil {
			t.Fatalf("write compose: %v", err)
		}
	}
	if env != "" {
		if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(env), 0644); err != nil {
			t.Fatalf("write env: %v", err)
		}
	}
	return dir
}

func TestNormalizeAppName(t *testing.T) {
	valid := []string{"myapp", "my-app", "a1", "deepseekharness"}
	for _, name := range valid {
		if _, err := normalizeAppName(name); err != nil {
			t.Errorf("normalizeAppName(%q) unexpected error: %v", name, err)
		}
	}
	invalid := []string{"", " ", "-myapp", "myapp-", "my_app", "my.app", "a/b"}
	for _, name := range invalid {
		if _, err := normalizeAppName(name); err == nil {
			t.Errorf("normalizeAppName(%q) expected error", name)
		}
	}
	if _, err := normalizeAppName("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"); err == nil {
		t.Error("expected error for 41-char name")
	}
	// Names are trimmed and lower-cased before validation.
	if got, err := normalizeAppName("  My-App  "); err != nil || got != "my-app" {
		t.Errorf("normalizeAppName(My-App) = (%q, %v), want (my-app, nil)", got, err)
	}
}

func TestValidSource(t *testing.T) {
	valid := []string{"1.2.3.4", "120.227.164.219", "10.0.0.0/8", "2001:db8::/32", "::1"}
	for _, s := range valid {
		if !validSource(s) {
			t.Errorf("validSource(%q) = false, want true", s)
		}
	}
	invalid := []string{"", "1.2.3", "999.1.1.1", "example.com", "10.0.0.0/33", "1.2.3.4; rm -rf /", "$(whoami)"}
	for _, s := range invalid {
		if validSource(s) {
			t.Errorf("validSource(%q) = true, want false", s)
		}
	}
}

func TestResolvePortValue(t *testing.T) {
	env := map[string]string{"PORT": "8080", "EMPTY": ""}
	cases := []struct {
		field string
		want  string
		ok    bool
	}{
		{"8080", "8080", true},
		{"${PORT}", "8080", true},
		{"$PORT", "8080", true},
		{"PORT", "8080", true},
		{"  3080  ", "3080", true},
		{"8000-8010", "", false},
		{"${MISSING}", "", false},
		{"${EMPTY}", "", false},
		{"", "", false},
	}
	for _, c := range cases {
		got, ok := resolvePortValue(c.field, env)
		if ok != c.ok || got != c.want {
			t.Errorf("resolvePortValue(%q) = (%q, %v), want (%q, %v)", c.field, got, ok, c.want, c.ok)
		}
	}
}

func TestComposePublishedHostPorts(t *testing.T) {
	compose := `services:
  app:
    image: example/app:latest
    ports:
      - "${PORT}:8080"
      - "0.0.0.0:9443:8443"
      - "3080:3080"
      - "3080:3080"
      - "8081"
    expose:
      - "7000"
`
	dir := writeApp(t, "myapp", compose, "APP_NAME=myapp\nPORT=8080\n")
	got, err := ComposePublishedHostPorts(dir)
	if err != nil {
		t.Fatalf("ComposePublishedHostPorts: %v", err)
	}
	want := []string{"8080", "9443", "3080"}
	sort.Strings(got)
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ComposePublishedHostPorts = %v, want %v", got, want)
	}
}

func TestHostPortsFromInspect(t *testing.T) {
	raw := `[{"Labels":{"com.docker.compose.project":"myapp"},
	  "NetworkSettings":{"Ports":{
	    "3080/tcp":[{"HostIp":"0.0.0.0","HostPort":"3080"}],
	    "8443/tcp":[{"HostIp":"0.0.0.0","HostPort":"9443"}],
	    "9001/tcp":[{"HostIp":"0.0.0.0","HostPort":"3080"}],
	    "7000/tcp":[{"HostIp":"0.0.0.0","HostPort":""}],
	    "7001/tcp":null}}}]`
	var items []inspectContainer
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	got := hostPortsFromInspect(items)
	want := []string{"3080", "9443"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("hostPortsFromInspect = %v, want %v", got, want)
	}
}

func TestPublishedHostPortsPrefersDocker(t *testing.T) {
	stubDocker(t, func(ctx context.Context, args ...string) ([]byte, error) {
		switch args[0] {
		case "ps":
			if args[len(args)-2] != "--format" {
				return nil, errors.New("unexpected ps args")
			}
			return []byte("abc123\n"), nil
		case "inspect":
			return []byte(`[{"NetworkSettings":{"Ports":{"5000/tcp":[{"HostIp":"0.0.0.0","HostPort":"5000"}]}}}]`), nil
		}
		return nil, errors.New("unexpected command: " + args[0])
	})

	dir := writeApp(t, "myapp", "services:\n  app:\n    ports:\n      - \"8080:8080\"\n", "PORT=8080\n")
	got, err := PublishedHostPorts(dir)
	if err != nil {
		t.Fatalf("PublishedHostPorts: %v", err)
	}
	if !reflect.DeepEqual(got, []string{"5000"}) {
		t.Errorf("PublishedHostPorts = %v, want docker mapping [5000]", got)
	}
}

func TestPublishedHostPortsFallsBackToCompose(t *testing.T) {
	stubDocker(t, func(ctx context.Context, args ...string) ([]byte, error) {
		return nil, errors.New("docker unavailable")
	})
	dir := writeApp(t, "myapp", "services:\n  app:\n    ports:\n      - \"${PORT}:8080\"\n", "PORT=8080\n")
	got, err := PublishedHostPorts(dir)
	if err != nil {
		t.Fatalf("PublishedHostPorts: %v", err)
	}
	if !reflect.DeepEqual(got, []string{"8080"}) {
		t.Errorf("PublishedHostPorts = %v, want fallback [8080]", got)
	}
}

func TestDockerPublishedHostPortsRejectsBadProject(t *testing.T) {
	stubDocker(t, func(ctx context.Context, args ...string) ([]byte, error) {
		t.Fatal("docker must not be called for an invalid project name")
		return nil, nil
	})
	if _, err := DockerPublishedHostPorts("Bad/Name"); err == nil {
		t.Error("expected error for invalid project name")
	}
}

func TestWhitelistRequired(t *testing.T) {
	plain := writeApp(t, "changedetection", "services:\n  app:\n    image: linuxserver/changedetection.io\n", "")
	if whitelistRequired(plain) {
		t.Error("plain app should not require a whitelist")
	}

	harness := writeApp(t, "deepseekharness", "services:\n  app:\n    image: ghcr.io/huoxue1/deepseek-harness:latest\n", "")
	if !whitelistRequired(harness) {
		t.Error("deepseek-harness compose should require a whitelist")
	}

	flagged := writeApp(t, "secretapp", "services:\n  app:\n    image: example/app\n", "")
	if err := os.WriteFile(filepath.Join(flagged, ".proberx_meta"), []byte("template=custom\nwhitelist_required=1\n"), 0644); err != nil {
		t.Fatalf("write meta: %v", err)
	}
	if !whitelistRequired(flagged) {
		t.Error("whitelist_required=1 meta flag should require a whitelist")
	}
}

func TestResolveEnforcement(t *testing.T) {
	cases := []struct {
		sources  []string
		required bool
		want     enforcementAction
	}{
		{[]string{"1.2.3.4"}, false, enforceRules},
		{[]string{"1.2.3.4"}, true, enforceRules},
		{nil, true, enforceDenyAll},
		{[]string{}, true, enforceDenyAll},
		{nil, false, enforceClear},
		{[]string{}, false, enforceClear},
	}
	for _, c := range cases {
		if got := resolveEnforcement(c.sources, c.required); got != c.want {
			t.Errorf("resolveEnforcement(%v, %v) = %v, want %v", c.sources, c.required, got, c.want)
		}
	}
}

func TestLoadAndStoreSources(t *testing.T) {
	dir := writeApp(t, "myapp", "services: {}\n", "")
	if got := loadSources(dir); got != nil {
		t.Errorf("loadSources on empty dir = %v, want nil", got)
	}
	if err := storeSources(dir, []string{"1.2.3.4", "10.0.0.0/8"}); err != nil {
		t.Fatalf("storeSources: %v", err)
	}
	got := loadSources(dir)
	if !reflect.DeepEqual(got, []string{"1.2.3.4", "10.0.0.0/8"}) {
		t.Errorf("loadSources = %v", got)
	}
	if err := storeSources(dir, nil); err != nil {
		t.Fatalf("storeSources(nil): %v", err)
	}
	if got := loadSources(dir); len(got) != 0 {
		t.Errorf("loadSources after clear = %v, want empty", got)
	}
}
