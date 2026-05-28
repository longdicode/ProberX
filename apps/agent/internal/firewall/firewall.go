package firewall

import (
	"fmt"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
)

type Rule struct {
	Num      string `json:"num"`
	Pkts     string `json:"pkts"`
	Bytes    string `json:"bytes"`
	Target   string `json:"target"`
	Prot     string `json:"prot"`
	Opt      string `json:"opt"`
	In       string `json:"in"`
	Out      string `json:"out"`
	Source   string `json:"source"`
	Dest     string `json:"destination"`
	Extra    string `json:"extra,omitempty"`
}

type ChainInfo struct {
	Chain  string `json:"chain"`
	Policy string `json:"policy"`
	Rules  []Rule `json:"rules"`
}

type ListResult struct {
	Chains []ChainInfo `json:"chains"`
	Error  string      `json:"error,omitempty"`
}

type AddRuleRequest struct {
	Chain       string `json:"chain"`
	Protocol    string `json:"protocol,omitempty"`
	SrcIP       string `json:"src_ip,omitempty"`
	DstIP       string `json:"dst_ip,omitempty"`
	SrcPort     string `json:"src_port,omitempty"`
	DstPort     string `json:"dst_port,omitempty"`
	InInterface  string `json:"in_interface,omitempty"`
	OutInterface string `json:"out_interface,omitempty"`
	Target      string `json:"target"`
	Extra       string `json:"extra,omitempty"`
}

type DeleteRuleRequest struct {
	Chain string `json:"chain"`
	Num   string `json:"num"`
}

func List() (*ListResult, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("firewall management is only supported on Linux (iptables)")
	}

	chains := []string{"INPUT", "OUTPUT", "FORWARD"}
	result := &ListResult{}

	for _, chain := range chains {
		info, err := listChain(chain)
		if err != nil {
			result.Error = fmt.Sprintf("failed to list chain %s: %v", chain, err)
			continue
		}
		result.Chains = append(result.Chains, *info)
	}

	return result, nil
}

func AddRule(req AddRuleRequest) (map[string]string, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("firewall management is only supported on Linux (iptables)")
	}

	chain := strings.ToUpper(req.Chain)
	if !validChain(chain) {
		chain = "INPUT"
	}

	args := buildRuleArgs(chain, req)

	cmd := exec.Command("iptables", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("iptables failed: %s", string(output))
	}

	info, err := listChain(chain)
	if err != nil {
		return map[string]string{"status": "added", "chain": chain}, nil
	}

	newNum := "?"
	if len(info.Rules) > 0 {
		newNum = info.Rules[len(info.Rules)-1].Num
	}

	return map[string]string{
		"status": "added",
		"chain":  chain,
		"num":    newNum,
	}, nil
}

func DeleteRule(req DeleteRuleRequest) (map[string]string, error) {
	if runtime.GOOS == "windows" {
		return nil, fmt.Errorf("firewall management is only supported on Linux (iptables)")
	}

	chain := strings.ToUpper(req.Chain)
	if !validChain(chain) {
		return nil, fmt.Errorf("invalid chain: %s", chain)
	}

	args := []string{"-D", chain, req.Num}
	cmd := exec.Command("iptables", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("iptables failed: %s", string(output))
	}

	return map[string]string{
		"status": "deleted",
		"chain":  chain,
		"num":    req.Num,
	}, nil
}

func listChain(chain string) (*ChainInfo, error) {
	cmd := exec.Command("iptables", "-L", chain, "-v", "-n", "--line-numbers")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("%s", string(output))
	}

	return parseChain(string(output), chain), nil
}

func parseChain(output string, chainName string) *ChainInfo {
	lines := strings.Split(output, "\n")
	info := &ChainInfo{Chain: chainName}

	policyRe := regexp.MustCompile(`(?i)Chain\s+\S+\s+\(policy\s+(\S+)`)
	for _, line := range lines {
		if m := policyRe.FindStringSubmatch(line); m != nil {
			info.Policy = strings.ToUpper(m[1])
			break
		}
	}
	if info.Policy == "" {
		info.Policy = "ACCEPT"
	}

	headerRe := regexp.MustCompile(`^\s*num\s+pkts\s+bytes\s+target`)
	for i, line := range lines {
		if headerRe.MatchString(line) {
			for j := i + 1; j < len(lines); j++ {
				rule := parseRuleLine(lines[j])
				if rule == nil {
					continue
				}
				info.Rules = append(info.Rules, *rule)
			}
			break
		}
	}

	return info
}

func parseRuleLine(line string) *Rule {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil
	}

	fields := strings.Fields(line)
	if len(fields) < 8 {
		return nil
	}

	rule := &Rule{
		Num:    fields[0],
		Pkts:   fields[1],
		Bytes:  fields[2],
		Target: fields[3],
		Prot:   fields[4],
		Opt:    fields[5],
		In:     fields[6],
		Out:    fields[7],
		Source: fields[8],
		Dest:   fields[9],
	}

	if len(fields) > 10 {
		rule.Extra = strings.Join(fields[10:], " ")
	}

	return rule
}

func buildRuleArgs(chain string, req AddRuleRequest) []string {
	args := []string{"-A", chain}

	if req.Protocol != "" {
		args = append(args, "-p", req.Protocol)
	}
	if req.SrcIP != "" {
		args = append(args, "-s", req.SrcIP)
	}
	if req.DstIP != "" {
		args = append(args, "-d", req.DstIP)
	}
	if req.SrcPort != "" {
		args = append(args, "--sport", req.SrcPort)
	}
	if req.DstPort != "" {
		args = append(args, "--dport", req.DstPort)
	}
	if req.InInterface != "" {
		args = append(args, "-i", req.InInterface)
	}
	if req.OutInterface != "" {
		args = append(args, "-o", req.OutInterface)
	}
	args = append(args, "-j", req.Target)

	if req.Extra != "" {
		args = append(args, strings.Fields(req.Extra)...)
	}

	return args
}

func validChain(chain string) bool {
	chain = strings.ToUpper(chain)
	switch chain {
	case "INPUT", "OUTPUT", "FORWARD", "PREROUTING", "POSTROUTING":
		return true
	}
	valid := regexp.MustCompile(`^[A-Z][A-Z0-9_-]*$`)
	return valid.MatchString(chain)
}

func validRuleNumber(num string) bool {
	n, err := strconv.Atoi(num)
	return err == nil && n > 0
}

var _ = validRuleNumber
