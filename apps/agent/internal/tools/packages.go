package tools

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// ListPackages returns installed or upgradable packages.
func ListPackages(upgradableOnly bool) ([]PackageInfo, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("package management is only supported on Linux")
	}

	mgr := detectPkgManager()
	if mgr == "" {
		return nil, fmt.Errorf("no supported package manager found (apt, yum, dnf)")
	}

	return listWithManager(mgr, upgradableOnly)
}

// UpgradePackages runs a system upgrade.
func UpgradePackages() (map[string]string, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("package management is only supported on Linux")
	}

	mgr := detectPkgManager()
	if mgr == "" {
		return nil, fmt.Errorf("no supported package manager found")
	}

	var cmd *exec.Cmd
	switch mgr {
	case "apt":
		cmd = exec.Command("apt", "upgrade", "-y")
	case "yum":
		cmd = exec.Command("yum", "update", "-y")
	case "dnf":
		cmd = exec.Command("dnf", "upgrade", "-y")
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("upgrade failed: %s", string(output))
	}

	return map[string]string{
		"manager": mgr,
		"status":  "ok",
		"output":  strings.TrimSpace(string(output)),
	}, nil
}

func detectPkgManager() string {
	for _, mgr := range []string{"apt", "dnf", "yum"} {
		if _, err := exec.LookPath(mgr); err == nil {
			return mgr
		}
	}
	return ""
}

func listWithManager(mgr string, upgradableOnly bool) ([]PackageInfo, error) {
	var cmd *exec.Cmd
	switch mgr {
	case "apt":
		if upgradableOnly {
			cmd = exec.Command("apt", "list", "--upgradable")
		} else {
			cmd = exec.Command("dpkg-query", "-W", "-f=${Package}\t${Version}\t${Architecture}\t${Description}\n")
		}
	case "yum":
		if upgradableOnly {
			cmd = exec.Command("yum", "check-update")
		} else {
			cmd = exec.Command("rpm", "-qa", "--queryformat=%{NAME}\t%{VERSION}\t%{ARCH}\t%{SUMMARY}\n")
		}
	case "dnf":
		if upgradableOnly {
			cmd = exec.Command("dnf", "check-update")
		} else {
			cmd = exec.Command("rpm", "-qa", "--queryformat=%{NAME}\t%{VERSION}\t%{ARCH}\t%{SUMMARY}\n")
		}
	}

	output, err := cmd.CombinedOutput()
	if err != nil && upgradableOnly {
		if len(output) == 0 {
			return nil, fmt.Errorf("%s failed: %v", mgr, err)
		}
	}

	var packages []PackageInfo
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Listing") || strings.HasPrefix(line, "Last metadata") {
			continue
		}

		if upgradableOnly && mgr == "apt" {
			parts := strings.SplitN(line, "/", 2)
			name := parts[0]
			rest := ""
			if len(parts) > 1 {
				rest = parts[1]
			}
			fields := strings.Fields(rest)
			if len(fields) >= 1 {
				packages = append(packages, PackageInfo{
					Name:       name,
					NewVersion: fields[0],
					Upgradable: true,
				})
			}
		} else {
			fields := strings.Split(line, "\t")
			if len(fields) < 2 {
				continue
			}
			pkg := PackageInfo{Name: fields[0], Version: fields[1]}
			if len(fields) > 2 {
				pkg.Architecture = fields[2]
			}
			if len(fields) > 3 {
				pkg.Description = fields[3]
			}
			packages = append(packages, pkg)
		}
	}
	return packages, nil
}
