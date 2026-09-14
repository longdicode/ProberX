import { and, desc, eq, lt, ne, or } from "drizzle-orm";
import { diagnosisRuns } from "../db/schema/diagnosis-runs";
import { servers } from "../db/schema/servers";
import { AppError } from "../utils/errors";
import { chatComplete, extractJson } from "./llm-client";
import { executeShellCommand } from "./tools.service";
import { indexMemory, recallMemory } from "./memory.service";
import type { DbClient } from "../db/index";
import { createHash } from "node:crypto";
import { resolveAiLlm } from "./ai-settings.service";
import type { AiLlmOverrides } from "./ai-settings.service";
import { expertDef } from "./expert-agents";
import type { ExpertAgentDef } from "./expert-agents";
import * as queue from "./diagnosis-queue";

// Types

// 步骤级“动态规划”事件：让失败重试 / 路径切换 / 证据复核可见、可审计
export interface DiagnosisStepEvent {
  type: "planner_retry" | "tool_error" | "adapt" | "gate_verify";
  label: string;
  detail: string;
}

export interface DiagnosisStep {
  index: number;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  command: string;
  status: "running" | "done" | "error";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  judgment: string;
  startedAt: string;
  finishedAt: string;
  event?: DiagnosisStepEvent | null;
}

interface VerifyVerdict {
  status: "recovered" | "still_failing" | "cannot_verify";
  note: string;
}

interface PlannerOut {
  decision: "investigate" | "conclude" | "stop";
  note: string;
  action?: { tool: string; args: Record<string, unknown>; reason: string };
  conclusion?: {
    root_cause: string;
    confidence: number;
    evidence: string;
    suggestions: { title: string; detail: string }[];
  };
}

// Limits

const MAX_STEPS = 10;
const MAX_VERIFY_ROUNDS = 2;
const AUTO_TRIGGER_COOLDOWN_MINUTES = 60;
const TOTAL_TIMEOUT_MS = 20 * 60 * 1000;
// A run still "running" beyond the max duration + grace means the orchestrating
// process died/restarted mid-run. Recover it so the server is not permanently locked.
const STALE_RUN_MS = TOTAL_TIMEOUT_MS + 10 * 60 * 1000;

// Tool whitelist (read-only, structurured args → command)

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function safeName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^[A-Za-z0-9_.\-:]{1,100}$/.test(v) ? v : null;
}
function safePath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (v.length > 300 || v.includes("..") || !v.startsWith("/")) return null;
  return /^[\/A-Za-z0-9_.\-]{1,300}$/.test(v) ? v : null;
}

type ToolBuild = (args: Record<string, unknown>) => string | null;

export const DIAGNOSIS_TOOLS: Record<string, { desc: string; build: ToolBuild }> = {
  disk_usage: {
    desc: "查看磁盘与 inode 使用情况（df -h / df -i）",
    build: () => "df -h; echo '--- inodes ---'; df -i",
  },
  memory: { desc: "查看内存使用（free -m）", build: () => "free -m" },
  load: { desc: "查看负载与运行时长（uptime/loadavg）", build: () => "uptime; echo '--- loadavg ---'; cat /proc/loadavg" },
  processes: {
    desc: "按 CPU 或内存排序查看进程，args: {sort: cpu|mem, limit: 5-30}",
    build: (a) => {
      const sort = a.sort === "mem" ? "pmem" : "pcpu";
      const limit = clampInt(a.limit, 5, 30, 10);
      return `ps -eo pid,ppid,pcpu,pmem,rss,comm --sort=-${sort} | head -${limit}`;
    },
  },
  services: {
    desc: "查看单个服务状态或失败服务列表，args: {name?: 服务名}",
    build: (a) => {
      const name = safeName(a.name);
      return name
        ? `systemctl status ${name} --no-pager -l | head -50`
        : "systemctl --failed --no-pager | head -20";
    },
  },
  docker: {
    desc: "容器列表或容器日志，args: {sub: ps|logs, name?: 容器名, tail?: 10-500}",
    build: (a) => {
      if (a.sub === "logs") {
        const name = safeName(a.name);
        if (!name) return null;
        const tail = clampInt(a.tail, 10, 500, 100);
        return `docker logs --tail ${tail} ${name} 2>&1 | head -120`;
      }
      // Include PORTS: without it the planner cannot tie a container to the
      // port it serves, and it re-runs the same listing hoping for more.
      return 'docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Image}}\\t{{.Ports}}" | head -40';
    },
  },
  logs: {
    desc: "读取日志文件末尾，args: {path: 绝对路径, tail?: 10-500}",
    build: (a) => {
      const path = safePath(a.path);
      if (!path) return null;
      const tail = clampInt(a.tail, 10, 500, 100);
      return `tail -n ${tail} ${path} 2>&1 | head -120`;
    },
  },
  network: { desc: "查看监听端口与连接（ss）", build: () => "echo '=== key ports 80/443/3100/4000/3000/8080/888/8888 ==='; ss -tlnp 2>/dev/null | grep -E ':(80|443|3100|4000|3000|8080|888|8888) ' | head -25; echo '=== all listeners ==='; ss -tln 2>/dev/null | awk 'NR>1 && $1==\"LISTEN\" {print $1, $4}' | sort -u | head -60" },
  files: {
    desc: "列出目录内容，args: {path: 绝对路径, limit?: 5-100}",
    build: (a) => {
      const path = safePath(a.path);
      if (!path) return null;
      const limit = clampInt(a.limit, 5, 100, 40);
      return `ls -lah ${path} 2>&1 | head -${limit}`;
    },
  },
  cat_file: {
    desc: "查看配置文件内容（只读，自动截断），args: {path: 绝对路径, limit?: 10-200}",
    build: (a) => {
      const path = safePath(a.path);
      if (!path) return null;
      const head = clampInt(a.limit, 10, 200, 80);
      return `cat ${path} 2>&1 | head -${head}`;
    },
  },
  os_info: { desc: "查看系统与发行版信息", build: () => "uname -a; echo '---'; head -5 /etc/os-release" },
  http_check: {
    desc: "从服务器本机对 URL 做 HTTP/HTTPS 探测（只读），args: {url: http(s)://host[:port][/path]}",
    build: (a) => {
      const url = safeUrl(a.url);
      if (!url) return null;
      return `echo '=== probe ${url} ==='; curl -skI -m 12 '${url}' | head -12; echo '--- status ---'; curl -sk -m 12 -o /dev/null -w 'http=%{http_code} time=%{time_total}s ip=%{remote_ip}\n' '${url}' || true`;
    },
  },
  web_stack: {
    desc: "识别真实运行的 Web 服务栈并做本机访问验证，args: {domain?: 站点域名}；用于区分宝塔/容器环境与 systemd 服务",
    build: (a) => {
      const domain = safeName(a.domain);
      const parts = [
        "echo '=== nginx/apache/caddy procs ==='",
        "ps -eo pid,args | grep -E '[n]ginx|[a]pache2?|[c]addy' | head -15",
        "echo '=== 80/443/8080/8888/3100/4000 listeners ==='",
        "ss -tlnp 2>/dev/null | grep -E ':(80|443|8080|8888|3100|4000) ' | head -25 || true",
        "echo '=== docker ps ==='",
        "docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | head -15 || true",
      ];
      if (domain) {
        parts.push(
          "echo '=== local curl with Host header ==='",
          `curl -sI -m 8 http://127.0.0.1/ -H 'Host: ${domain}' | head -8 || true`,
          `curl -skI -m 8 https://127.0.0.1/ -H 'Host: ${domain}' | head -8 || true`
        );
      }
      return parts.join("; ");
    },
  },

  cert_check: {
    desc: "校验域名证书与 HTTPS 握手（只读，不跳过证书校验），args: {domain: 站点域名}",
    build: (a) => {
      const domain = safeName(a.domain);
      if (!domain) return null;
      return `echo '=== real HTTPS (no -k) ==='; curl -sI -m 12 https://${domain} | head -8; echo '=== cert ==='; echo | timeout 12 openssl s_client -connect 127.0.0.1:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null || true`;
    },
  },

  // ---- 专项诊断助手新增只读工具（13 个专项助手共用；全部参数化+白名单命令） ----

  mysql: {
    desc: "MySQL 只读诊断（白名单 SQL，无凭据自动尝试本机 socket），args: {sub: status|processlist|slow|schema, db?: 库名}",
    build: (a) => {
      const sub = a.sub === "processlist" ? "processlist" : a.sub === "slow" ? "slow" : a.sub === "schema" ? "schema" : "status";
      const db = safeName(a.db);
      const S = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
      const qs: Record<string, string> = {
        status:
          "SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Threads_running','Max_used_connections','Connections','Queries','Slow_queries','Aborted_connects','Open_tables');",
        processlist: "SHOW FULL PROCESSLIST;",
        slow: "SHOW VARIABLES WHERE Variable_name IN ('slow_query_log','slow_query_log_file','long_query_time'); SHOW GLOBAL STATUS LIKE 'Slow_queries';",
        schema: db
          ? `SELECT table_name AS t, ROUND((data_length+index_length)/1024/1024,2) AS size_mb FROM information_schema.tables WHERE table_schema=${S(db)} ORDER BY (data_length+index_length) DESC LIMIT 30;`
          : "SELECT table_schema AS db, COUNT(*) AS tables, ROUND(SUM(data_length+index_length)/1024/1024,1) AS size_mb FROM information_schema.tables GROUP BY table_schema ORDER BY size_mb DESC LIMIT 20;",
      };
      const parts = [
        "echo '=== mysql/mariadb 进程 ==='",
        "ps -eo pid,cmd | grep -E '[m]ysqld|[m]ariadbd' | head -8 || true",
        "echo '=== 3306 监听 ==='",
        "ss -tlnp 2>/dev/null | grep ':3306 ' | head -8 || true",
        "echo '=== 客户端版本 ==='",
        "mysql --version 2>&1 | head -1 || true",
        `echo '=== 只读SQL: ${sub} ==='`,
        `mysql --protocol=socket -uroot --connect-timeout=5 -e ${S(qs[sub])} 2>&1 | head -50`,
      ];
      if (sub === "slow") {
        parts.push(
          "echo '=== 慢查询日志(常见路径尾部) ==='",
          "for f in /www/server/data/mysql-slow.log /www/server/data/*-slow.log /var/lib/mysql/*-slow.log /var/log/mysql/mysql-slow.log /var/log/mysql/slow-query.log; do [ -f \"$f\" ] && { echo \"--- $f ---\"; tail -n 30 \"$f\"; }; done 2>/dev/null"
        );
      }
      if (sub === "schema" && !db) {
        parts.push("echo '=== 数据目录 ==='", "ls -d /www/server/data /var/lib/mysql 2>/dev/null || true");
      }
      return parts.join("\n");
    },
  },
  crontab: {
    desc: "列出系统/宝塔计划任务与 systemd timer（只读），args: {}",
    build: () => [
      "echo '=== crontab -l (当前用户) ==='",
      "crontab -l 2>&1 | head -100",
      "echo '=== /var/spool/cron/crontabs ==='",
      "ls -la /var/spool/cron/crontabs/ 2>/dev/null | head -20 || true",
      "for f in /var/spool/cron/crontabs/*; do [ -f \"$f\" ] && { echo \"--- $f ---\"; grep -vE '^\\s*(#|$)' \"$f\" | head -120; }; done 2>/dev/null",
      "echo '=== /etc/crontab 与 /etc/cron.d ==='",
      "cat /etc/crontab 2>/dev/null | grep -vE '^\\s*(#|$)' | head -60 || true",
      "for f in /etc/cron.d/*; do [ -f \"$f\" ] && { echo \"--- $f ---\"; grep -vE '^\\s*(#|$)' \"$f\" | head -60; }; done 2>/dev/null",
      "echo '=== 宝塔计划任务目录 /www/server/cron ==='",
      "ls -lah /www/server/cron 2>/dev/null | head -20 || true",
      "echo '=== systemd timers ==='",
      "systemctl list-timers --no-pager 2>/dev/null | head -25 || true",
    ].join("\n"),
  },
  auth_audit: {
    desc: "安全只读审计：登录/失败登录/fail2ban/对外监听/异常连接，args: {}",
    build: () => [
      "echo '=== 最近成功登录 (last) ==='",
      "last -n 15 2>/dev/null | head -20",
      "echo '=== 失败登录 (lastb) ==='",
      "lastb -n 15 2>/dev/null | head -20 || echo '(无 btmp/未开启 lastb)'",
      "echo '=== 24h sshd 失败登录计数 ==='",
      "journalctl -u ssh -u sshd --since -24h --no-pager 2>/dev/null | grep -icE 'failed|invalid user|authentication failure' || true",
      "echo '=== fail2ban ==='",
      "if command -v fail2ban-client >/dev/null 2>&1; then fail2ban-client status 2>&1 | head -30; else echo '(未安装 fail2ban-client)'; fi",
      "echo '=== 对外(非回环)监听 ==='",
      "ss -tlnp 2>/dev/null | awk 'NR>1 && $4 !~ /^127\\./ && $4 !~ /^\\[::1\\]/ {print}' | head -25 || true",
      "echo '=== established 连接 TOP IP ==='",
      "ss -tn state established 2>/dev/null | awk 'NR>1 {n=split($5,a,\":\"); ip=a[n-1]; c[ip]++} END {for (ip in c) print c[ip], ip}' | sort -rn | head -10 || true",
    ].join("\n"),
  },
  access_traffic: {
    desc: "分析 Web 访问日志流量：请求量/状态码/IP/TOP 路径（只读），args: {}",
    build: () => [
      'echo "=== 发现的 access 日志(最近6个) ==="',
      'ls -1t /www/wwwlogs/*.log /www/wwwroot/*/logs/*access*.log /www/server/nginx/logs/*access*.log /var/log/nginx/*access*.log 2>/dev/null | head -6',
      'echo "=== 逐文件统计(最近3个) ==="',
      'for f in $(ls -1t /www/wwwlogs/*.log /www/wwwroot/*/logs/*access*.log /www/server/nginx/logs/*access*.log /var/log/nginx/*access*.log 2>/dev/null | head -3); do',
      '  [ -f "$f" ] || continue',
      '  echo "--- $f ---"',
      '  wc -l "$f" 2>/dev/null | head -1',
      '  echo "-- 状态码 TOP --"',
      '  awk \'{print $9}\' "$f" 2>/dev/null | sort | uniq -c | sort -rn | head -6',
      '  echo "-- 客户端 IP TOP --"',
      '  awk \'{print $1}\' "$f" 2>/dev/null | sort | uniq -c | sort -rn | head -6',
      '  echo "-- 请求路径 TOP --"',
      '  awk \'{print $7}\' "$f" 2>/dev/null | sort | uniq -c | sort -rn | head -6',
      '  echo "-- 最近 3 条 --"',
      '  tail -n 3 "$f" 2>/dev/null',
      'done',
    ].join("\n"),
  },
  error_logs: {
    desc: "读取系统/应用错误日志：journald + 常见 error 日志（只读），args: {}",
    build: () => [
      "echo '=== journald 错误(24h) ==='",
      "journalctl -p err --since -24h --no-pager 2>/dev/null | head -60 || echo '(无 journalctl 或无错误)'",
      "echo '=== 常见 error 日志尾部 ==='",
      "for f in /www/wwwlogs/*.error.log /www/server/nginx/logs/error.log /var/log/nginx/error.log /www/server/panel/logs/error.log /www/server/panel/logs/panel_error.log; do [ -f \"$f\" ] && { echo \"--- $f ---\"; tail -n 25 \"$f\"; }; done 2>/dev/null",
      "echo '=== 站点级 error 日志 ==='",
      "ls -1t /www/wwwroot/*/logs/*error*.log 2>/dev/null | head -3 | while read f; do [ -f \"$f\" ] && { echo \"--- $f ---\"; tail -n 20 \"$f\"; }; done",
      "echo '=== syslog/messages 严重级别 ==='",
      "grep -iE 'error|critical|panic' /var/log/syslog /var/log/messages 2>/dev/null | tail -n 20 || true",
    ].join("\n"),
  },
  dir_usage: {
    desc: "目录空间占用分布与大文件 TOP（只读，限制层级），args: {}",
    build: () => [
      "echo '=== 主要目录总占用 ==='",
      "du -sh /www/wwwroot /www/server /www/wwwlogs /var/log /home /root /tmp 2>/dev/null | sort -rh | head -12",
      "echo '=== /www/wwwroot 一级占用 ==='",
      "du -x --max-depth=1 /www/wwwroot 2>/dev/null | sort -rh | head -12",
      "echo '=== 大文件 TOP（>=200MB，限 wwwroot/logs/tmp） ==='",
      "find /www/wwwroot /var/log /tmp -xdev -type f -size +200M 2>/dev/null | head -20 | while read f; do ls -lh \"$f\" 2>/dev/null | awk '{print $5, $NF}'; done",
    ].join("\n"),
  },
  ftp_check: {
    desc: "FTP 服务诊断：进程/21 端口/配置/账户列表（只读），args: {}",
    build: () => [
      "echo '=== FTP 进程 ==='",
      "ps -eo pid,cmd | grep -E '[p]ure-ftpd|[v]sftpd|[p]roftpd' | head -10 || true",
      "echo '=== 21 端口 ==='",
      "ss -tlnp 2>/dev/null | grep -E ':21 ' | head -10 || true",
      "echo '=== FTP 配置文件(去注释) ==='",
      "for f in /www/server/pure-ftpd/etc/pure-ftpd.conf /etc/pure-ftpd/pure-ftpd.conf /etc/vsftpd.conf /etc/vsftpd/vsftpd.conf; do [ -f \"$f\" ] && { echo \"--- $f ---\"; grep -vE '^\\s*(#|$)' \"$f\" | head -40; }; done 2>/dev/null",
      "echo '=== FTP 用户(pure-pw list) ==='",
      "if command -v pure-pw >/dev/null 2>&1; then pure-pw list 2>/dev/null || echo '(pure-pw 执行失败/无权限)'; else echo '(未安装 pure-pw)'; fi",
      "echo '=== 被动端口范围(常见配置项) ==='",
      "grep -iE 'PassivePortRange|pasv|portrange' /www/server/pure-ftpd/etc/pure-ftpd.conf /etc/pure-ftpd/pure-ftpd.conf /etc/vsftpd.conf 2>/dev/null | head -10 || true",
    ].join("\n"),
  },
  ssl_config: {
    desc: "读取服务器 SSL 证书配置与有效期（openssl 解析，只读），args: {domain?: 域名过滤}",
    build: (a) => {
      const domain = safeName(a.domain);
      const parts = [
        "echo '=== nginx -T 中的证书路径 ==='",
        "(nginx -T 2>/dev/null || /usr/local/nginx/sbin/nginx -T 2>/dev/null || /www/server/nginx/sbin/nginx -T 2>/dev/null) | grep -E '^\\s*ssl_certificate(_key)?\\s' | head -12 || true",
        "echo '=== 宝塔证书目录(openssl 解析) ==='",
        "for d in /www/server/panel/vhost/cert/*/; do [ -d \"$d\" ] || continue;",
        "  cert=$(ls \"$d\" 2>/dev/null | grep -E 'fullchain|\\.pem' | head -1);",
        "  [ -n \"$cert\" ] || continue;",
        "  echo \"--- $d$cert ---\";",
        "  openssl x509 -noout -subject -issuer -dates -ext subjectAltName -in \"$d$cert\" 2>/dev/null || true;",
        "done",
      ];
      if (domain) {
        parts.push("echo '=== 匹配域名证书目录 ==='", `ls -1 /www/server/panel/vhost/cert/${domain}/ 2>/dev/null || true`);
      }
      parts.push(
        "echo '=== letsencrypt 通用证书 ==='",
        "for c in /etc/letsencrypt/live/*/fullchain.pem; do [ -f \"$c\" ] && { echo \"--- $c ---\"; openssl x509 -noout -subject -dates -ext subjectAltName -in \"$c\" 2>/dev/null; }; done 2>/dev/null"
      );
      return parts.join("\n");
    },
  },
  dns_check: {
    desc: "DNS 解析对照诊断：本机/公共 DNS/NS 记录（只读），args: {domain: 域名}",
    build: (a) => {
      const domain = safeName(a.domain);
      if (!domain) return null;
      return [
        `echo '=== 本机解析 ${domain} ==='`,
        `getent ahosts ${domain} 2>/dev/null | head -8 || echo '(getent 无结果)'`,
        "echo '=== dig(默认DNS) ==='",
        `dig +short ${domain} A 2>/dev/null | head -8 || true`,
        "echo '=== dig @1.1.1.1 ==='",
        `dig @1.1.1.1 +short ${domain} A 2>/dev/null | head -8 || true`,
        "echo '=== dig @8.8.8.8 ==='",
        `dig @8.8.8.8 +short ${domain} A 2>/dev/null | head -8 || true`,
        "echo '=== NS 记录 ==='",
        `dig +short ${domain} NS 2>/dev/null | head -8 || true`,
        "echo '=== resolv.conf ==='",
        "cat /etc/resolv.conf 2>/dev/null | head -10 || true",
        "echo '=== hosts 干扰 ==='",
        `grep -E "${domain}" /etc/hosts 2>/dev/null || echo '(hosts 无相关记录)'`,
        "echo '=== 公网出口 IP ==='",
        "curl -s -m 8 https://api.ipify.org 2>/dev/null || curl -s -m 8 https://ifconfig.me 2>/dev/null || echo '(无法获取)'",
      ].join("\n");
    },
  },

  webshell_scan: {
    desc: "网站代码后门/WebShell 扫描（只读，不执行代码）：扫描指定网站目录或单个文件，识别 PHP 一句话/大马、编码混淆执行、JSP/ASPX 木马特征与恶意 .htaccess/.user.ini。args: {path: 目标目录或文件绝对路径(必填)}",
    build: (a) => {
      const path = safePath(a.path);
      if (!path) return null;
      const filesExpr = [
        "find \"$T\" -type f \\(",
        "-iname '*.php' -o -iname '*.php3' -o -iname '*.php4' -o -iname '*.php5' -o -iname '*.php7' -o -iname '*.phtml' -o -iname '*.pht' -o -iname '*.phps'",
        "-o -iname '*.jsp' -o -iname '*.jspx' -o -iname '*.asp' -o -iname '*.aspx' -o -iname '*.ashx' -o -iname '*.asa' -o -iname '*.asmx'",
        "-o -iname '*.cgi' -o -iname '*.pl' -o -iname '*.py'",
        "-o -name '.htaccess' -o -name '.user.ini'",
        "\\) -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/.svn/*' -not -path '*/vendor/*' -not -path '*/runtime/*' -not -path '*/cache/*' -not -path '*/tmp/*' 2>/dev/null | head -3000",
      ].join(" ");
      return [
        "echo '========== WebShell / 后门检测（只读）=========='",
        `T=${path}`,
        "if [ ! -e \"$T\" ]; then echo '错误: 目标不存在或不可访问'; exit 0; fi",
        "if [ -d \"$T\" ]; then",
        "  FILES=$(" + filesExpr + ")",
        "  echo '扫描类型: 目录递归'",
        "else",
        "  FILES=\"$T\"",
        "  echo '扫描类型: 单文件'",
        "fi",
        "[ -z \"$FILES\" ] && { echo '未发现可扫描的脚本文件'; exit 0; }",
        "SCANNED=$(echo \"$FILES\" | wc -l)",
        "echo \"目标: $T\"",
        "echo \"待扫描文件数: $SCANNED\"",
        "",
        "echo '---------- [高危] 动态执行后门 (eval/assert/system/exec 等接收入参) ----------'",
        "grep -nHE --color=never -e '(eval|assert|system|exec|shell_exec|passthru|popen|proc_open)\\s*\\(\\s*\\$_(GET|POST|REQUEST|COOKIE|SERVER)' -e '(eval|assert|system|shell_exec|passthru)\\s*\\(\\s*\\$' $FILES 2>/dev/null | head -60 | cut -c1-240 || true",
        "",
        "echo '---------- [高危] 已知工具/一句话特征 (c99/r57/b374k/wso 等, 大小写不敏感) ----------'",
        "grep -inHF --color=never -e 'c99sh' -e 'r57shell' -e 'b374k' -e 'filespy' -e 'phpspy' -e 'marijuana' -e 'china chopper' -e '$GLOBALS[' $FILES 2>/dev/null | head -60 | cut -c1-240 || true",
        "",
        "echo '---------- [高危] JSP/ASPX/动态脚本执行特征 ----------'",
        "grep -nHE --color=never -e 'Runtime\\s*\\.\\s*getRuntime\\s*\\(\\s*\\)\\s*\\.\\s*exec' -e 'ProcessBuilder' -e 'javax\\s*\\.\\s*script' -e 'System\\s*\\.\\s*Diagnostics\\s*\\.\\s*Process' -e 'Process\\s*\\.\\s*Start\\s*\\(' $FILES 2>/dev/null | head -60 | cut -c1-240 || true",
        "",
        "echo '---------- [可疑] 编码/压缩载荷 (base64_decode/gzinflate/str_rot13, 建议人工复核) ----------'",
        "grep -nHE --color=never -e '(base64_decode|gzinflate|gzuncompress|str_rot13)\\s*\\(' -e '(base64_decode|gzinflate)\\s*\\(\\s*[A-Za-z0-9+/=]{200,}' $FILES 2>/dev/null | head -80 | cut -c1-240 || true",
        "",
        "echo '---------- [可疑] 动态函数/正则执行 (create_function/preg_replace 带 e/array_map assert) ----------'",
        "grep -nHE --color=never -e 'create_function\\s*\\(' -e 'preg_replace\\s*\\(\\s*[\"][^\"].*[/][a-z]*e[a-z]*[\"]' -e 'array_map\\s*\\(\\s*[\"]assert[\"]' $FILES 2>/dev/null | head -60 | cut -c1-240 || true",
        "",
        "echo '---------- [可疑] .htaccess/.user.ini 恶意配置 (auto_prepend/AddType/php_value) ----------'",
        "grep -nHE --color=never -e 'auto_prepend_file' -e 'auto_append_file' -e 'AddType\\s+.*php' -e 'SetHandler.*php' $FILES 2>/dev/null | head -40 | cut -c1-240 || true",
        "",
        "echo '---------- 汇总 ----------'",
        "echo \"已扫描文件数: $SCANNED（超过 3000 个将截断）\"",
        "echo '提示: 命中行不等于后门，请人工复核文件内容后再处置；未命中也不代表绝对安全。'",
      ].join("\n");
    },
  },

};

const TOOL_DESCS = Object.entries(DIAGNOSIS_TOOLS)
  .map(([name, t]) => `- ${name}: ${t.desc}`)
  .join("\n");

const SYSTEM_PROMPT_CORE = `你是一名资深 Linux 运维排障专家，运行在 ProberX 智能体平台上。
用户会给出一个需要排查的问题，你可以通过只读工具逐步采集证据，最终定位根因。

规则：
1. 每次只返回 1 个 JSON 对象，不要 markdown 代码块，不要多余文字。
2. 优先用具体证据（磁盘/内存/进程/服务/日志）说话，不要凭空猜测。
3. decision=investigate 时必须包含 action(tool/args/reason)，args 必须符合工具说明中的参数格式。
4. 证据充分、根因明确时用 decision=conclude，并给出 conclusion。
5. 工具执行失败或被拒绝时，换一个角度继续排查；不要反复执行相同命令。
6. stop 仅用于确认问题无法定位或无需继续。
7. 自动取证优先：只要问题涉及服务器/网站/服务/资源/数据的实际状态，就必须先自动调用白名单工具取证，禁止不执行任何工具就凭经验或模型知识直接下结论。
8. 参数不全时不要反问用户：先用发现类工具（web_stack/files/network/services/processes/mysql/dns_check 等）自动定位候选域名/目录/服务/库，再继续取证；只有所有自动发现手段都用尽时才可 stop。
9. 提供多轮上下文时延续上一轮结论继续验证或收尾，不要重复已确认内容；reason 需写明依据的证据或待验证点。

可用工具：
${TOOL_DESCS}

输出格式（严格 JSON，字段名固定）：
{"decision":"investigate|conclude|stop","note":"本次想法，100字内","action":{"tool":"工具名","args":{},"reason":"为什么执行这一步"},"conclusion":{"root_cause":"根因","confidence":0到100的整数,"evidence":"证据链描述","suggestions":[{"title":"建议标题","detail":"具体操作说明"}]}}`;

const GENERIC_DOMAIN_RULES = `补充规则（Web/服务类问题与结论可信度）：
- 涉及网站/域名/Web 访问问题时，优先用 web_stack/network 确认真实运行中的 Web 进程与 80/443 监听，再下结论。
- 宝塔/BT 面板环境通常由 /www/server/nginx 启动 nginx（systemd 的 nginx.service 可能 disabled/inactive），禁止仅凭 systemd 状态断定“Web 服务未运行”。
- 结论中的每个断言必须与已执行步骤输出一致：证据显示某端口在 LISTEN 或进程在运行，就不得写成“未监听/未运行”。
- evidence 必须引用步骤号；仅有间接证据或无法核实时应写明“待验证”，confidence 不超过 70；有直接证据且无冲突时方可 80 以上。
- 不要脑补故障（如把管理通道失败说成网站宕机）；无法取证时如实区分“已确认”与“未确认”。
- 涉及域名/网站且结论涉及证书/HTTPS/访问失败时，必须用 cert_check/http_check 做真实（不带 -k）的 HTTPS 请求，或 openssl 校验证书的 subject/SAN/有效期；证书目录名或配置文件名与域名不一致（如 pannel vs panel）只是命名差异，不能作为证书无效的依据。
- 当多维度证据（进程/端口/证书/本机与公网访问/日志）均正常、找不到故障痕迹时，应及时 conclude 并写明“当前检测未见异常或故障可能已恢复”，不要为凑步骤无限扩大排查；结论必须能被步骤证据支持。`;

const SYSTEM_PROMPT = `${SYSTEM_PROMPT_CORE}\n\n${GENERIC_DOMAIN_RULES}`;

// 专项助手规划提示：替换角色定位与工具白名单，追加专项规则与通用红线
function buildExpertPlannerPrompt(ex: ExpertAgentDef): string {
  const descs = ex.tools
    .map((t) => (DIAGNOSIS_TOOLS[t] ? `- ${t}: ${DIAGNOSIS_TOOLS[t].desc}` : ""))
    .filter(Boolean)
    .join("\n");
  const core = SYSTEM_PROMPT_CORE.replace(
    /用户会给出一个需要排查的问题，你可以通过只读工具逐步采集证据，最终定位根因。\n/,
    `本次任务由「${ex.name}」承接。\n用户会给出一个需要专项诊断的问题，你可以通过只读工具逐步采集证据，最终给出结论。\n专项范围：${ex.focus}\n`
  ).replace(/可用工具：\n([\s\S]*?)(?=\n\n输出格式)/, `可用工具（仅限以下白名单，禁止使用白名单之外的任何工具）：\n${descs}`);
  return `${core}\n\n【${ex.name} 专项规则】\n${ex.domainRules.join("\n")}\n\n通用红线：\n- 结论中的每个断言必须与已执行步骤输出一致：证据显示某端口在 LISTEN 或进程在运行，就不得写成“未监听/未运行”。\n- evidence 必须引用步骤号；仅有间接证据或无法核实时写明“待验证”，confidence 不超过 70；有直接证据且无冲突时方可 80 以上。\n- 不要编造步骤输出中不存在的证据；无法取证时如实区分“已确认”与“未确认”。`;
}

// 单步输出过长时保留首尾，避免关键行（如 ss 中 80/443 的监听行）被整段截掉
function summarizeOutput(raw: string, head = 800, tail = 800): string {
  const t = raw ?? "";
  if (t.length <= head + tail + 40) return t;
  return `${t.slice(0, head)}\n……（中间省略 ${t.length - head - tail} 字符）……\n${t.slice(-tail)}`;
}

// 从问题描述中提取域名，用于定向复核（避免用整个 goal 做参数）
function extractDomain(goal: string): string | null {
  const m = /[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+/.exec(goal);
  return m ? safeName(m[0]) : null;
}

// http_check 用 URL 白名单校验，只允许 http(s) 与安全字符，杜绝命令注入
function safeUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^https?:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,200})?(?::\d{1,5})?(?:\/[A-Za-z0-9._~%\-/]*)?$/.exec(v.trim());
  return m ? m[0] : null;
}

// 一致性门禁：把结论中的关键断言与步骤输出比对，返回冲突描述
function findEvidenceConflicts(
  conclusion: { root_cause?: string; evidence?: string },
  steps: DiagnosisStep[]
): string[] {
  const text = `${conclusion.root_cause ?? ""}\n${conclusion.evidence ?? ""}`;
  const out: string[] = [];

  // 1) 收集步骤输出中确实处于 LISTEN 的端口
  const listening = new Map<number, number>();
  for (const st of steps) {
    if (st.status !== "done") continue;
    const body = `${st.stdout}\n${st.stderr}`;
    const re = /(?:^|\n)[ \t]*LISTEN[ \t]+\d+[ \t]+\d+[ \t]+\S+:(\d+)[ \t]/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(body))) {
      const port = Number(mm[1]);
      if (!listening.has(port)) listening.set(port, st.index);
    }
  }
  // 2) 结论中出现“端口未监听 / 未发现X监听 / 无监听”等否定断言
  const claimRe: RegExp[] = [
    /未(?:发现|见|检测到)?[^。；\n]{0,14}(\d{2,5})[^。；\n]{0,8}(?:监听|listen)/gi,
    /(\d{2,5})[^。；\n]{0,10}(?:未监听|没有监听|无监听|不在监听|not listening)/gi,
  ];
  if (listening.size) {
    const claimed = new Map<number, string>();
    for (const re of claimRe) {
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(text))) {
        const port = Number(mm[1] ?? mm[2]);
        if (Number.isInteger(port) && port >= 1 && port <= 65535 && !claimed.has(port)) {
          claimed.set(port, mm[0].slice(0, 60));
        }
      }
    }
    for (const [port, frag] of claimed) {
      const idx = listening.get(port);
      if (idx != null) out.push(`步骤 ${idx} 输出显示端口 ${port} 处于 LISTEN，与结论“${frag}”冲突`);
    }
  }
  // 3) 结论称 nginx/web 服务未运行，但步骤显示存在 master 进程或 active(running)
  if (/(?:nginx|apache2?|httpd|web服务|Web服务)[^。；\n]{0,12}(?:未运行|没有运行|未启动|未开启)/i.test(text)) {
    const running = steps.some((st) => {
      if (st.status !== "done") return false;
      const body = `${st.stdout}\n${st.stderr}`;
      return /(?:nginx|apache2?|httpd)[^|\n]*: master process/i.test(body) || /Active: active \(running\)/i.test(body);
    });
    if (running) out.push("步骤输出显示 Web 服务进程正在运行，但结论称其未运行");
  }
  return out;
}

// 置信度校准：与证据冲突时封顶 60，避免“证据矛盾还高置信”
function calibrateConfidence(raw: number | null | undefined, warnings: string[]): number | null {
  if (raw == null) return null;
  const base = Math.max(0, Math.min(100, Math.round(raw)));
  return warnings.length ? Math.min(base, 60) : base;
}

// 存在一致性警告时在正文前附加醒目提示
function annotateWarnings(text: string | null | undefined, warnings: string[]): string {
  if (!text) return text ?? "";
  return warnings.length ? `【一致性警告】${warnings.join("；")}\n\n${text}` : text;
}

function buildUserPrompt(
  goal: string,
  serverName: string,
  host: string,
  steps: DiagnosisStep[],
  gateNote = "",
  memoryNote = ""
): string {
  const history = steps.length
    ? steps
        .map(
          (st) =>
            `步骤${st.index} [${st.tool}${st.status === "error" ? " 执行失败" : ""}] ${st.reason}\n` +
            `命令: ${st.command || "(无)"}\n` +
            `退出码: ${st.exitCode ?? "-"}\n` +
            `输出: ${summarizeOutput(st.stdout + (st.stderr ? "\n[stderr] " + st.stderr : ""))}\n` +
            `判断: ${st.judgment || "-"}`
        )
        .join("\n\n")
    : "（尚无已执行步骤）";
  const note = gateNote ? `${gateNote}\n\n` : "";
  return `待排查问题：${goal}\n目标服务器：${serverName}（${host || "未配置主机名"}）\n\n${note}已经执行的排查步骤：\n${history}${memoryNote}\n\n请输出下一个行动（JSON）。`;
}

// PostgreSQL jsonb cannot store \\u0000 (NUL). Command output such as
// `cat /proc/<pid>/cmdline` contains NUL bytes, so sanitize control
// characters into visible placeholders before persisting to the DB.
function sanitizeOutput(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, (ch) => {
    const code = ch.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase();
    return `[\\u${code}]`;
  });
}

function sanitizeJson(value: unknown): unknown {
  if (typeof value === "string") return sanitizeOutput(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeJson(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeJson(v);
    return out;
  }
  return value;
}

async function saveSteps(db: DbClient, runId: string, steps: DiagnosisStep[]) {
  await db
    .update(diagnosisRuns)
    .set({ steps: sanitizeJson(steps) as unknown as Record<string, unknown>[] })
    .where(eq(diagnosisRuns.id, runId));
}

// --- 证据指纹：对取证/修复/复检步骤做 SHA-256 防篡改留痕 ---

const FINGERPRINT_TOOL = "证据指纹";

/** 计算除指纹条目外全部步骤的 SHA-256（含命令、退出码、输出），用于校验记录是否被篡改 */
export function computeEvidenceFingerprint(steps: DiagnosisStep[]): string {
  const rest = steps.filter((s) => !(s.tool || "").startsWith(FINGERPRINT_TOOL));
  const payload = rest.map((s) => [
    s.index,
    s.tool,
    s.command ?? "",
    s.exitCode ?? null,
    s.status ?? "",
    s.stdout ?? "",
    s.stderr ?? "",
  ]);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/** 读取时间线中已保存的证据指纹 */
export function storedFingerprint(steps: DiagnosisStep[]): string | null {
  for (const s of steps) {
    if ((s.tool || "").startsWith(FINGERPRINT_TOOL) && typeof s.command === "string" && s.command.startsWith("sha256:")) {
      return s.command.slice("sha256:".length);
    }
  }
  return null;
}

/** 移除旧指纹并用最新步骤重建指纹条目（追加到时间线末尾） */
function refreshFingerprint(steps: DiagnosisStep[]): DiagnosisStep[] {
  const rest = steps.filter((s) => !(s.tool || "").startsWith(FINGERPRINT_TOOL)).map((s, i) => ({ ...s, index: i + 1 }));
  const hash = computeEvidenceFingerprint(rest);
  const now = new Date().toISOString();
  return [
    ...rest,
    {
      index: rest.length + 1,
      tool: FINGERPRINT_TOOL,
      args: { algo: "sha256" },
      reason: "对全部取证/修复/复检步骤生成防篡改指纹，导出或复核时可校验记录完整性",
      command: `sha256:${hash}`,
      status: "done",
      stdout: "",
      stderr: "",
      exitCode: 0,
      judgment: `证据指纹 sha256:${hash.slice(0, 16)}…（完整指纹见命令行；如库中记录被改动，指纹将校验失败）`,
      startedAt: now,
      finishedAt: now,
    },
  ];
}

export interface SimilarCase {
  id: string;
  title: string;
  goal: string;
  rootCause: string | null;
  confidence: number | null;
  createdAt: Date;
  similarity: number;
  repaired: boolean;
  rechecked: boolean;
}

function normText(v: string): string {
  return (v ?? "").toLowerCase().replace(/\s+/g, "");
}

function charBigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 中文友好的字符二元组 Dice 相似度（0-1） */
function textSimilarity(a: string, b: string): number {
  const A = charBigrams(normText(a));
  const B = charBigrams(normText(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/** 历史案例命中：从同服务器（或同工作区）历史成功排查中召回相似案例，作为可复用的 Runbook 证据 */
async function findSimilarCases(
  run: { id: string; workspaceId: string; serverId: string | null; goal: string | null; rootCause: string | null },
  db: DbClient
): Promise<SimilarCase[]> {
  const conds = [
    eq(diagnosisRuns.workspaceId, run.workspaceId),
    eq(diagnosisRuns.status, "success"),
    ne(diagnosisRuns.id, run.id),
  ];
  if (run.serverId) conds.push(eq(diagnosisRuns.serverId, run.serverId));
  const rows = await db
    .select({
      id: diagnosisRuns.id,
      title: diagnosisRuns.title,
      goal: diagnosisRuns.goal,
      rootCause: diagnosisRuns.rootCause,
      confidence: diagnosisRuns.confidence,
      createdAt: diagnosisRuns.createdAt,
      steps: diagnosisRuns.steps,
    })
    .from(diagnosisRuns)
    .where(and(...conds))
    .orderBy(desc(diagnosisRuns.createdAt))
    .limit(40);
  const target = `${run.goal ?? ""} ${run.rootCause ?? ""}`;
  return rows
    .map((r) => ({
      similarity: textSimilarity(target, `${r.goal ?? ""} ${r.rootCause ?? ""}`),
      r,
    }))
    .filter((x) => x.similarity >= 0.18)
    .sort((x, y) => y.similarity - x.similarity)
    .slice(0, 5)
    .map(({ similarity, r }) => {
      const sts = (Array.isArray(r.steps) ? r.steps : []) as DiagnosisStep[];
      return {
        id: r.id,
        title: r.title ?? "",
        goal: r.goal ?? "",
        rootCause: r.rootCause ?? null,
        confidence: r.confidence,
        createdAt: r.createdAt,
        similarity: Math.round(similarity * 100),
        repaired: sts.some((s) => (s.tool || "").startsWith("修复·")),
        rechecked: sts.some((s) => (s.tool || "") === "复检结论"),
      };
    });
}

/** 从时间线末尾解析最近一次复检结论 */
function lastVerdict(steps: DiagnosisStep[]): "recovered" | "still_failing" | "cannot_verify" | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if ((s.tool || "") !== "复检结论") continue;
    const m = /判定：(已恢复|仍异常|无法核实)/.exec(s.stdout ?? "");
    if (!m) return null;
    return m[1] === "已恢复" ? "recovered" : m[1] === "仍异常" ? "still_failing" : "cannot_verify";
  }
  return null;
}

const DYNAMIC_LABELS: Record<string, string> = {
  path_switch: "路径切换",
  retry_after_error: "失败后重试/换路",
  conflict_recheck: "冲突复核",
  second_verify: "二次验证",
};

const DIAG_FAMILIES: Record<string, string> = {
  network: "端口/网络",
  http_check: "端口/网络",
  web_stack: "端口/网络",
  cert_check: "证书/HTTPS",
  services: "systemd 服务",
  docker: "容器",
  processes: "进程",
  logs: "日志",
  files: "文件/配置",
  cat_file: "文件/配置",
  os_info: "系统",
  disk_usage: "资源",
  memory: "资源",
  load: "资源",
  mysql: "数据库",
  crontab: "计划任务",
  auth_audit: "安全/登录",
  access_traffic: "访问日志",
  error_logs: "错误日志",
  dir_usage: "文件/磁盘",
  ftp_check: "FTP",
  ssl_config: "证书/HTTPS",
  dns_check: "DNS",
};

// 取证维度流转：按真实步骤统计覆盖的维度（自动规划/多工具调用的稳定证据）
function buildDimensionFlowLines(steps: DiagnosisStep[]): string[] {
  const seen: { fam: string; first: number }[] = [];
  for (const s of steps) {
    const fam = DIAG_FAMILIES[s.tool] ?? (s.tool.slice(0, 12) || s.tool);
    if (!seen.some((v) => v.fam === fam)) seen.push({ fam, first: s.index });
    if (seen.length >= 8) break;
  }
  if (seen.length === 0) return [];
  if (seen.length === 1)
    return [`- 全程聚焦“${seen[0].fam}”维度取证，共 ${steps.length} 步工具调用`];
  const flow = seen.map((v, i) => (i === 0 ? `${v.fam}（自第 ${v.first} 步起）` : v.fam)).join(" → ");
  return [`- 取证维度流转：${flow}，跨 ${seen.length} 类维度、共 ${steps.length} 步工具调用`];
}

// 确定性兜底：由步骤事件标记生成动态规划摘要（LLM 摘要失败或为空时使用）
function buildDynamicEventsText(steps: DiagnosisStep[]): string {
  const lines: string[] = [];
  for (const s of steps) {
    const ev = s.event;
    if (!ev) continue;
    if (ev.type === "planner_retry")
      lines.push(`- 第 ${s.index} 步（${s.tool}）前：模型规划输出解析失败后自动重试成功 — ${ev.detail}`);
    if (ev.type === "tool_error") lines.push(`- 第 ${s.index} 步（${s.tool}）执行失败：${ev.detail}`);
    if (ev.type === "adapt") lines.push(`- 第 ${s.index} 步（${s.tool}）：${ev.detail}`);
    if (ev.type === "gate_verify") lines.push(`- 第 ${s.index} 步（${s.tool}）：${ev.detail}`);
  }
  return lines.length ? "\n\n【动态规划与异常处理】\n" + lines.join("\n") : "";
}

// 确定性“路径切换”检测：上一步判断出现异常/否定信号，且下一步换到另一取证维度时记录
function buildAdaptiveSwitchLines(steps: DiagnosisStep[]): string[] {
  const signalRe =
    /未监听|无监听|未在监听|连接被拒绝|拒绝|失败|未运行|未找到|异常|Exited|退出|not listening|refused|no such|error/i;
  const lines: string[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (prev.status !== "done" || cur.status !== "done") continue;
    if (prev.event?.type === "tool_error" || cur.event) continue; // 已由事件标记覆盖
    const pf = DIAG_FAMILIES[prev.tool];
    const cf = DIAG_FAMILIES[cur.tool];
    if (!pf || !cf || pf === cf) continue;
    const text = `${prev.judgment ?? ""} ${prev.reason ?? ""}`;
    if (!signalRe.test(text)) continue;
    const snippet = text.trim().slice(0, 80) || "结果异常";
    lines.push(
      `- 路径切换：第 ${prev.index} 步 ${prev.tool}（${snippet}…）后，第 ${cur.index} 步转用 ${cur.tool}（${cf}维度）继续取证`
    );
  }
  return lines.slice(0, 5);
}

function fallbackDynamicsText(steps: DiagnosisStep[]): string {
  const parts: string[] = [];
  const flow = buildDimensionFlowLines(steps);
  if (flow.length) parts.push(flow.join("\n"));
  const ev = buildDynamicEventsText(steps).trim();
  if (ev) parts.push(ev);
  const sw = buildAdaptiveSwitchLines(steps);
  if (sw.length) parts.push(sw.join("\n"));
  return parts.length ? "\n\n【动态规划与异常处理】\n" + parts.join("\n") : "";
}

// 诊断结束后生成“动态规划与异常处理”摘要：只引用真实步骤，禁止编造
async function summarizeDynamics(goal: string, steps: DiagnosisStep[], llm?: AiLlmOverrides): Promise<string> {
  if (!steps.length) return "";
  try {
    const compact = steps
      .map(
        (s) =>
          `第${s.index}步 [${s.status}] 工具=${s.tool}\n` +
          `命令: ${(s.command ?? "").slice(0, 150)}\n` +
          `输出摘要: ${(s.stdout ?? "").slice(0, 180).replace(/\s+/g, " ")}\n` +
          `判断: ${(s.judgment ?? "").slice(0, 180)}`
      )
      .join("\n\n");
    const sys = `你是客观的排障过程审计员。下面是一次自主排查的完整步骤（工具/输出/判断）。请识别其中真实发生的“动态规划”证据，只输出 JSON 数组，每项格式：{"step": 数字, "type": "path_switch|retry_after_error|conflict_recheck|second_verify", "summary": "一句话中文，引用真实步骤内容"}。
规则：
- 只允许引用上面真实出现的步骤号与工具；严禁编造。
- path_switch：某步结果导致下一步明显换了检查方向（如端口无监听后去查容器/服务状态，证书或上游异常后转查另一链路）。
- retry_after_error：步骤失败/超时/无有效输出后，下一步重试或换命令。
- conflict_recheck / second_verify：对同一目标做第二次验证，或因证据冲突强制复核。
- 没有强证据就输出 []。`;
    const raw = await chatComplete({
      system: sys,
      user: `原始问题：${goal ?? ""}\n\n步骤：\n${compact}\n\n输出 JSON 数组。`,
      ...(llm ?? {}),
      temperature: 0,
      maxTokens: 2048,
      timeoutMs: 90_000,
    });
    const arr = extractJson<{ step: number; type: string; summary: string }[]>(raw);
    if (!Array.isArray(arr) || arr.length === 0) return fallbackDynamicsText(steps);
    const lines = arr
      .slice(0, 8)
      .filter((it) => it && Number.isInteger(it.step))
      .map((it) => {
        const st = steps.find((s) => s.index === it.step);
        const suffix = st ? `（${st.tool}）` : "";
        const label = DYNAMIC_LABELS[it.type] ?? it.type;
        return `- 第 ${it.step} 步${suffix}：${label} — ${(it.summary ?? "").slice(0, 140)}`;
      });
    const flow = buildDimensionFlowLines(steps);
    const allLines = [...flow];
    if (lines.length) allLines.push(...lines);
    if (allLines.length) return "\n\n【动态规划与异常处理】\n" + allLines.join("\n");
    return fallbackDynamicsText(steps);
  } catch (err) {
    console.error("[diagnosis] summarizeDynamics failed:", (err as Error).message);
    return fallbackDynamicsText(steps);
  }
}

// Run orchestration

async function recoverStaleRuns(db: DbClient, serverId?: string) {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const conds = [eq(diagnosisRuns.status, "running"), lt(diagnosisRuns.startedAt, cutoff)];
  if (serverId) conds.push(eq(diagnosisRuns.serverId, serverId));
  const rows = await db
    .update(diagnosisRuns)
    .set({
      status: "failed",
      error: "运行超时或服务中断，已自动回收，可重新发起排查",
      finishedAt: new Date(),
    })
    .where(and(...conds))
    .returning({ id: diagnosisRuns.id });
  if (rows.length) console.warn(`[diagnosis] recovered ${rows.length} stale running run(s)`);
}

/** Options shared by every diagnosis entry point. */
export interface DiagnosisOptions {
  goal: string;
  title?: string;
  trigger?: "manual" | "auto";
  expertId?: string;
  context?: string;
  onProgress?: (p: { label: string; detail?: string; current: number; total: number }) => void;
}

// The scheduler lives in this process, so nothing can legitimately be running
// or waiting when it starts: any row left in those states was orphaned by a
// crash, restart or deploy. Close them out once, otherwise a stale "running"
// row blocks that server (the worker checks for one) until the 30-minute
// stale-run timeout. Assumes a single dashboard process, which is how the
// in-memory queue is designed to run.
let orphanedRunsRecovered = false;

/**
 * Closes out runs orphaned by a restart. Called once when the server boots so
 * the panel never keeps showing a run as "running" after the worker died;
 * also called lazily by createDiagnosisRun as a safety net.
 */
export async function recoverOrphanedRuns(db: DbClient) {
  if (orphanedRunsRecovered) return;
  orphanedRunsRecovered = true;
  try {
    const rows = await db
      .update(diagnosisRuns)
      .set({
        status: "failed",
        error: "排查在服务重启后中断，请重新发起",
        finishedAt: new Date(),
      })
      .where(or(eq(diagnosisRuns.status, "queued"), eq(diagnosisRuns.status, "running")))
      .returning({ id: diagnosisRuns.id });
    if (rows.length) console.warn(`[diagnosis] recovered ${rows.length} orphaned run(s)`);
  } catch (err) {
    console.error("[diagnosis] failed to recover orphaned runs:", (err as Error).message);
  }
}

/**
 * Creates the run row before any slow work happens (LLM resolution, memory
 * recall) so callers can return immediately while the run waits in the queue.
 */
export async function createDiagnosisRun(
  workspaceId: string,
  serverId: string,
  opts: DiagnosisOptions,
  db: DbClient
) {
  const [server] = await db
    .select({ name: servers.name })
    .from(servers)
    .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId)))
    .limit(1);
  if (!server) throw AppError.notFound("Server", serverId);

  await recoverOrphanedRuns(db);

  const expert = opts.expertId ? expertDef(opts.expertId) : null;
  const runId = crypto.randomUUID();
  const title = opts.title || `自主排查：${server.name}`;
  await db.insert(diagnosisRuns).values({
    id: runId,
    workspaceId,
    serverId,
    title,
    goal: opts.goal,
    status: "queued",
    trigger: opts.trigger ?? "manual",
    expertType: expert?.id ?? null,
  });
  return { id: runId, title };
}

/**
 * Executes a queued diagnosis to completion. This is the worker entry point
 * started by the scheduler, never a request handler.
 */
export async function executeDiagnosisRun(
  runId: string,
  workspaceId: string,
  serverId: string,
  opts: DiagnosisOptions,
  db: DbClient
) {
  const [run] = await db
    .select({ title: diagnosisRuns.title, status: diagnosisRuns.status })
    .from(diagnosisRuns)
    .where(eq(diagnosisRuns.id, runId))
    .limit(1);
  if (!run) return { id: runId, status: "failed" as const, steps: 0 };
  if (run.status === "stopped") return { id: runId, status: "stopped" as const, steps: 0 };

  const [server] = await db
    .select({ name: servers.name, hostInfo: servers.hostInfo })
    .from(servers)
    .where(and(eq(servers.id, serverId), eq(servers.workspaceId, workspaceId)))
    .limit(1);
  if (!server) throw AppError.notFound("Server", serverId);

  // AI 接口可配置到工作区设置；未启用时自动回退服务器环境变量
  const llm = await resolveAiLlm(db, workspaceId);
  // 专项诊断助手：约束规划提示与工具白名单，并落库 expert_type
  const expert = opts.expertId ? expertDef(opts.expertId) : null;
  const plannerSys = expert ? buildExpertPlannerPrompt(expert) : SYSTEM_PROMPT;

  // Recover runs orphaned by a previous crash/restart before checking for active ones.
  await recoverStaleRuns(db, serverId);

  // Safety net for runs started outside this process (another replica, or a
  // row left behind by a crash). The queue already serialises this server.
  if (queue.MAX_PER_SERVER <= 1) {
    const [active] = await db
      .select({ id: diagnosisRuns.id })
      .from(diagnosisRuns)
      .where(
        and(
          eq(diagnosisRuns.serverId, serverId),
          eq(diagnosisRuns.status, "running"),
          ne(diagnosisRuns.id, runId)
        )
      )
      .limit(1);
    if (active) {
      await db
        .update(diagnosisRuns)
        .set({ status: "failed", error: "该服务器已有进行中的自主排查", finishedAt: new Date() })
        .where(eq(diagnosisRuns.id, runId));
      throw AppError.badRequest("该服务器已有进行中的自主排查，请等待完成后重试");
    }
  }

  const hostInfo = (server.hostInfo as Record<string, unknown>) ?? {};
  const host = (hostInfo.agent_host as string) || "";
  const title = run.title || opts.title || `自主排查：${server.name}`;
  // 记忆向量检索：先召回同服务器的历史相似案例，作为规划提示（仅参考，不作为证据）
  const memHits = await recallMemory(db, { workspaceId, serverId, query: opts.goal, topK: 5, minScore: 0.32 });
  const memoryNote = memHits.length
    ? `\n\n【历史相似案例 · 仅供缩小排查范围，严禁照搬结论】\n${memHits
        .slice(0, 3)
        .map(
          (h) =>
            `- ${h.title}（相似度 ${Math.round(h.similarity * 100)}%）\n  ${h.content.slice(0, 200)}`
        )
        .join("\n")}\n以上内容来自历史记忆库，不是本次取证证据；请以本次只读命令输出为准。`
    : "";
  // 会话上下文：仅用于理解连续对话中的后续问题，严禁当作取证证据
  const contextNote = opts.context
    ? `\n\n【本次会话上下文 · 仅供理解用户连续对话的意图，严禁作为取证证据】\n${opts.context.slice(0, 2000)}`
    : "";
  const memoryNoteFull = memoryNote + contextNote;

  await db
    .update(diagnosisRuns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(diagnosisRuns.id, runId));

  const steps: DiagnosisStep[] = [];
  const started = Date.now();
  try {
    let conclusion: PlannerOut["conclusion"] | null = null;
    let lastParsed: PlannerOut | null = null;
    let gateNote = "";
    let forcedVerify = 0;

    while (Date.now() - started < TOTAL_TIMEOUT_MS) {
      const [cur] = await db
        .select({ status: diagnosisRuns.status })
        .from(diagnosisRuns)
        .where(eq(diagnosisRuns.id, runId))
        .limit(1);
      if (!cur || cur.status === "stopped") {
        await db
          .update(diagnosisRuns)
          .set({ status: "stopped", steps: steps as unknown as Record<string, unknown>[], finishedAt: new Date() })
          .where(eq(diagnosisRuns.id, runId));
        return { id: runId, status: "stopped" as const };
      }

      const user = buildUserPrompt(opts.goal, server.name, host, steps, gateNote, memoryNoteFull);
      let parsed: PlannerOut | null = null;
      let plannerRetries = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        const raw = await chatComplete({
          system: attempt > 0 ? plannerSys + "\n再次强调：只输出一个完整合法的 JSON 对象，不要 Markdown，不要截断。" : plannerSys,
          user,
          apiUrl: llm.apiUrl,
          apiKey: llm.apiKey,
          model: llm.model,
          temperature: attempt > 0 ? 0.2 : 0.3,
          maxTokens: 8192,
          timeoutMs: 120_000,
        });
        try {
          parsed = extractJson<PlannerOut>(raw);
          plannerRetries = attempt;
          break;
        } catch (e) {
          console.error(`[diagnosis] planner non-JSON attempt ${attempt}:`, raw.slice(0, 400));
        }
      }
      if (!parsed) throw new Error("诊断规划多次返回非 JSON 响应");
      lastParsed = parsed;

      if (parsed.decision === "conclude" || parsed.decision === "stop") {
        conclusion = parsed.conclusion ?? null;
        const conflicts = conclusion ? findEvidenceConflicts(conclusion, steps) : [];
        if (conflicts.length && forcedVerify < MAX_VERIFY_ROUNDS && steps.length < MAX_STEPS) {
          forcedVerify += 1;
          gateNote =
            "【一致性复核】你刚才的结论与已执行证据冲突：" +
            conflicts.join("；") +
            "。请勿忽略这些证据：先用验证工具复核端口/服务真实状态，再给出与证据一致的结论，不要重复相同命令。";
          const domain = extractDomain(opts.goal);
          const verifyTool = domain ? "web_stack" : "network";
          const verifyArgs = domain ? { domain } : {};
          const vcmd = DIAGNOSIS_TOOLS[verifyTool].build(verifyArgs);
          if (vcmd) {
            const vstep: DiagnosisStep = {
              index: steps.length + 1,
              tool: verifyTool,
              args: verifyArgs,
              reason: "结论与已有证据冲突，强制复核端口监听与运行进程",
              event: { type: "gate_verify", label: "证据复核", detail: "结论与已有证据冲突，系统强制复核端口/服务真实状态" },
              command: vcmd,
              status: "running",
              stdout: "",
              stderr: "",
              exitCode: null,
              judgment: gateNote,
              startedAt: new Date().toISOString(),
              finishedAt: "",
            };
            steps.push(vstep);
            await saveSteps(db, runId, steps);
            try {
              const res = await executeShellCommand(workspaceId, serverId, { command: vcmd, timeout: 30_000 }, db);
              vstep.status = "done";
              vstep.exitCode = res.exit_code;
              vstep.stdout = (res.stdout ?? "").slice(0, 4000);
              vstep.stderr = (res.stderr ?? "").slice(0, 2000);
            } catch (err) {
              vstep.status = "error";
              vstep.exitCode = -1;
              vstep.stderr = String((err as Error).message).slice(0, 1000);
            }
            vstep.finishedAt = new Date().toISOString();
            await saveSteps(db, runId, steps);
          }
          conclusion = null;
          continue;
        }
        break;
      }

      const toolName = parsed.action?.tool ?? "";
      const tool = DIAGNOSIS_TOOLS[toolName];
      const reason = parsed.action?.reason ?? parsed.note ?? "";
      const args = (parsed.action?.args ?? {}) as Record<string, unknown>;

      if (!tool) {
        steps.push({
          index: steps.length + 1,
          tool: toolName || "unknown",
          args,
          reason,
          command: "",
          status: "error",
          stdout: "",
          stderr: "工具不存在或不在白名单内，请换一个工具",
          exitCode: null,
          judgment: parsed.note ?? "",
          event: { type: "tool_error", label: "工具失败", detail: "工具不存在或不在白名单内，请换一个工具" },
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
        await saveSteps(db, runId, steps);
        continue;
      }
      // 专项助手工具白名单门禁：只允许该助手配置内工具
      if (expert && !expert.tools.includes(toolName)) {
        steps.push({
          index: steps.length + 1,
          tool: toolName || "unknown",
          args,
          reason,
          command: "",
          status: "error",
          stdout: "",
          stderr: `「${expert.name}」仅允许使用专项白名单工具，${toolName} 不在其中，请改用 ${expert.tools.slice(0, 6).join("/")} 等`,
          exitCode: null,
          judgment: parsed.note ?? "",
          event: { type: "tool_error", label: "工具失败", detail: `超出专项白名单：${toolName}` },
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
        await saveSteps(db, runId, steps);
        continue;
      }

      const command = tool.build(args);
      if (!command) {
        steps.push({
          index: steps.length + 1,
          tool: toolName,
          args,
          reason,
          command: "",
          status: "error",
          stdout: "",
          stderr: "参数非法（路径/名称格式不正确），请检查后重试",
          exitCode: null,
          judgment: parsed.note ?? "",
          event: { type: "tool_error", label: "工具失败", detail: "参数非法（路径/名称格式不正确），请检查后重试" },
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        });
        await saveSteps(db, runId, steps);
        continue;
      }

      const step: DiagnosisStep = {
        index: steps.length + 1,
        tool: toolName,
        args,
        reason,
        command,
        status: "running",
        stdout: "",
        stderr: "",
        exitCode: null,
        judgment: parsed.note ?? "",
        startedAt: new Date().toISOString(),
        finishedAt: "",
      };
      const prevStep = steps[steps.length - 1];
      if (prevStep?.event?.type === "tool_error" && prevStep.tool !== toolName) {
        step.event = {
          type: "adapt",
          label: "自适应切换",
          detail: `上一步“${prevStep.tool}”失败，自动切换至“${toolName}”继续取证`,
        };
      } else if (plannerRetries > 0) {
        step.event = {
          type: "planner_retry",
          label: "规划重试",
          detail: `模型规划输出解析失败 ${plannerRetries} 次后自动重试成功`,
        };
      }
      steps.push(step);
      await saveSteps(db, runId, steps);

      try {
        const res = await executeShellCommand(workspaceId, serverId, { command, timeout: 30_000 }, db);
        step.status = "done";
        step.exitCode = res.exit_code;
        step.stdout = (res.stdout ?? "").slice(0, 4000);
        step.stderr = (res.stderr ?? "").slice(0, 2000);
      } catch (err) {
        step.status = "error";
        step.exitCode = -1;
        step.stderr = String((err as Error).message).slice(0, 1000);
        step.event = { type: "tool_error", label: "工具失败", detail: String((err as Error).message).slice(0, 200) };
      }
      step.finishedAt = new Date().toISOString();
      await saveSteps(db, runId, steps);

      opts.onProgress?.({ label: `取证 · ${step.tool}`, detail: step.reason, current: Math.min(steps.length, MAX_STEPS), total: MAX_STEPS });

      if (steps.length >= MAX_STEPS) break;
    }

    if (!conclusion && lastParsed && lastParsed.decision === "investigate") {
      // 达到步数上限：让 LLM 基于全部证据做一次总结（不增加步骤数），失败则重试
      for (let attempt = 0; attempt < 3 && !conclusion; attempt++) {
        try {
          const raw = await chatComplete({
            system: plannerSys + "\n\n注意：步骤数已用尽，请直接给出 conclusion（decision=conclude）。",
            user: buildUserPrompt(opts.goal, server.name, host, steps, gateNote, memoryNoteFull) + "\n\n步骤数已用尽，请直接输出 conclude 结论，不要输出 investigate。",
            apiUrl: llm.apiUrl,
            apiKey: llm.apiKey,
            model: llm.model,
            temperature: 0.2,
            maxTokens: 8192,
            timeoutMs: 120_000,
          });
          const parsed = extractJson<PlannerOut>(raw);
          conclusion = parsed.conclusion ?? null;
          if (!conclusion) console.error(`[diagnosis] final summarize attempt ${attempt + 1} returned no conclusion`);
        } catch (err) {
          console.error("[diagnosis] final summarize failed:", (err as Error).message);
        }
      }
      if (!conclusion) {
        // 确定性兜底：绝不产出“空结论报告”
        conclusion = {
          root_cause:
            "已达到排查步骤上限（10 步），且自动总结未能收敛为单一根因。已完成的只读取证步骤均保留在报告中，建议缩小问题范围或人工复核各步骤输出。",
          confidence: 30,
          evidence: `共执行 ${steps.length} 步只读取证，覆盖端口监听、进程、配置、日志与访问探测，未收敛为单一根因；各步骤命令与输出详见报告正文。`,
          suggestions: [
            {
              title: "缩小问题范围后重试",
              detail: "补充更具体的信息（如访问报错截图、发生时间、受影响网络），重新发起排查。",
            },
          ],
        };
      }
    }

    opts.onProgress?.({ label: "自主排查", detail: "取证完成，正在总结根因并生成报告", current: Math.min(MAX_STEPS, Math.max(steps.length, 1)), total: MAX_STEPS });
    const finalConflicts = conclusion ? findEvidenceConflicts(conclusion, steps) : [];
    const dynamicNote = conclusion ? await summarizeDynamics(opts.goal, steps, llm) : "";
    const evidenceBase = conclusion?.evidence ? sanitizeOutput(annotateWarnings(conclusion.evidence, finalConflicts)) : "";
    const finalEvidence = evidenceBase + (dynamicNote || "");
    const sanitizedSteps = sanitizeJson(steps) as unknown as DiagnosisStep[];
    const finalSteps = refreshFingerprint(sanitizedSteps);
    await db
      .update(diagnosisRuns)
      .set({
        status: "success",
        steps: finalSteps as unknown as Record<string, unknown>[],
        rootCause: conclusion?.root_cause ?? null,
        confidence: conclusion?.confidence != null ? calibrateConfidence(conclusion.confidence, finalConflicts) : null,
        evidence: finalEvidence || null,
        conclusion: conclusion ? sanitizeOutput(annotateWarnings(`根因：${conclusion.root_cause}

证据：${conclusion.evidence}`, finalConflicts)) : null,
        suggestions: sanitizeJson(conclusion?.suggestions ?? []) as unknown as Record<string, unknown>[],
        finishedAt: new Date(),
        error: null,
      })
      .where(eq(diagnosisRuns.id, runId));

    // 后台异步沉淀为可检索记忆（不阻塞响应）
    void indexMemory(db, {
      workspaceId,
      serverId,
      sourceType: "diagnosis",
      sourceId: runId,
      title: (title || "自主排查").slice(0, 200),
      content: [
        `目标：${opts.goal ?? ""}`,
        `根因：${conclusion?.root_cause ?? ""}`,
        `证据：${(conclusion?.evidence ?? "").slice(0, 1800)}`,
        `建议：${((conclusion?.suggestions ?? []) as { title?: string; detail?: string }[])
          .map((s) => `${s?.title ?? ""}：${s?.detail ?? ""}`)
          .join("；")
          .slice(0, 800)}`,
      ].join("\n"),
    });

    return { id: runId, status: "success" as const, steps: steps.length, memoryHits: memHits };
  } catch (err) {
    const message = sanitizeOutput((err as Error).message);
    try {
      await db
        .update(diagnosisRuns)
        .set({
          status: "failed",
          steps: sanitizeJson(steps) as unknown as Record<string, unknown>[],
          error: message.slice(0, 2000),
          finishedAt: new Date(),
        })
        .where(eq(diagnosisRuns.id, runId));
    } catch (updateErr) {
      // 最后兜底：即使步骤内容仍无法写入，也绝不能让 run 卡在 running 锁住后续排查
      console.error("[diagnosis] failed to persist failed status with steps:", (updateErr as Error).message);
      await db
        .update(diagnosisRuns)
        .set({ status: "failed", error: message.slice(0, 2000), finishedAt: new Date() })
        .where(eq(diagnosisRuns.id, runId));
    }
    throw err;
  }
}

// --- 复检闭环：诊断完成后按需重跑只读验证，判定“已恢复/仍异常/无法核实” ---
/**
 * Starts a diagnosis and waits for it to finish. Used by the agent chat, which
 * needs the outcome to answer in the conversation.
 */
export async function startDiagnosis(
  workspaceId: string,
  serverId: string,
  opts: DiagnosisOptions,
  db: DbClient
) {
  const { id } = await createDiagnosisRun(workspaceId, serverId, opts, db);
  const { done } = queue.submit({ runId: id, workspaceId, serverId }, () =>
    executeDiagnosisRun(id, workspaceId, serverId, opts, db)
  );
  return (await done) as { id: string; status: string; steps?: number; memoryHits?: unknown };
}

/**
 * Starts a diagnosis without waiting for it: the HTTP route can answer at once
 * and the client polls the run row while it waits in the queue and then runs.
 */
export async function enqueueDiagnosis(
  workspaceId: string,
  serverId: string,
  opts: DiagnosisOptions,
  db: DbClient
) {
  const { id } = await createDiagnosisRun(workspaceId, serverId, opts, db);
  const { position, done } = queue.submit({ runId: id, workspaceId, serverId }, () =>
    executeDiagnosisRun(id, workspaceId, serverId, opts, db)
  );
  // The route returns immediately, so failures have to be reported here.
  done.catch((err) => console.error(`[diagnosis] run ${id} failed:`, (err as Error).message));
  return { id, status: position > 0 ? ("queued" as const) : ("running" as const), queuePosition: position };
}

/** Queue depth and back-pressure limits, for the panel. */
export function diagnosisQueueSnapshot() {
  return queue.snapshot();
}


const VERIFY_SYSTEM_PROMPT = `你是 ProberX 的复检裁判。系统刚刚对一次“自主排查”的目标服务器重新执行了若干只读复检命令（全部为白名单只读命令）。
请结合原始问题、原根因结论、修复建议与最新的复检输出，判断故障是否已经恢复。

只输出一个 JSON 对象，不要 Markdown，不要多余文字：
{"status":"recovered|still_failing|cannot_verify","note":"中文结论，60-120字"}
- recovered：复检证据显示原故障点已恢复正常（端口在监听、服务在运行、HTTPS/页面可达）。
- still_failing：复检证据显示原故障点仍然异常。
- cannot_verify：复检命令无法执行、无有效输出或证据不足，无法判断。
严禁编造复检输出中不存在的证据；证据不足时必须选择 cannot_verify。`;

// 从原 run 中提取“故障点”：被观察到 Exited/停止的容器、被引用为 127.0.0.1:PORT 或“端口 N”的端口，
// 供复检计划定向重查（复检必须覆盖原故障点，不能只查默认站点）
export function collectFaultHints(
  steps: DiagnosisStep[],
  goal: string,
  rootCause: string,
  evidence: string
): { container?: string; port?: number } {
  const allText = `${goal ?? ""}\n${rootCause ?? ""}\n${evidence ?? ""}`;
  const stepText = steps.map((s) => `${s.command ?? ""}\n${s.stdout ?? ""}\n${s.judgment ?? ""}`).join("\n");
  const hints: { container?: string; port?: number } = {};

  // 端口：优先 127.0.0.1/localhost:PORT；其次“端口 N/port N”
  const loopback = /(?:127\.0\.0\.1|localhost|0\.0\.0\.0):(\d{2,5})\b/i.exec(allText + "\n" + stepText);
  const word = /(?:端口|port)[^\d]{0,8}(\d{2,5})\b/i.exec(allText);
  const raw = (loopback?.[1] ?? word?.[1]) as string | undefined;
  const p = raw ? Number(raw) : NaN;
  if (Number.isInteger(p) && p >= 1 && p <= 65535) hints.port = p;

  // 容器：优先 docker ps 输出中处于 Exited/Dead 的容器名（原始证据），其次“docker 容器 xxx/容器 xxx”
  const exitedRe = /^\s*([A-Za-z0-9][A-Za-z0-9_.-]{0,62})\s+(?:Exited|Dead)\b/m;
  for (const st of steps) {
    if (hints.container) break;
    const m = exitedRe.exec(`${st.stdout ?? ""}\n${st.stderr ?? ""}`);
    if (m) hints.container = safeName(m[1]) ?? undefined;
  }
  if (!hints.container) {
    const m = /(?:docker\s+容器|容器|container)\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9_.-]{0,62})/i.exec(allText);
    if (m) hints.container = safeName(m[1]) ?? undefined;
  }
  return hints;
}

// --- 修复执行闭环：白名单修复方案 -> 用户确认 -> 执行 -> 审计 -> 自动复检 ---

export interface RepairOption {
  key: string;
  kind: "docker_container" | "systemd_service";
  title: string;
  detail: string;
  risk: "low" | "medium" | "high";
  command: string;
  rollback?: string;
  target: string;
}

// 容器名 / systemd 单元名仅允许安全字符，杜绝命令注入
const REPAIR_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,100}$/;

function parseFailedUnits(steps: DiagnosisStep[]): Set<string> {
  const units = new Set<string>();
  // 仅解析 systemctl --failed 失败清单中的单元（行内含 loaded failed），
  // 避免把 systemctl status 输出里 “● xxx.service - 描述” 的普通行误判为失败单元
  const re = /^[●*]\s+([A-Za-z0-9][A-Za-z0-9_.@-]*\.service)\s+loaded\s+failed\b/gm;
  for (const st of steps) {
    if (st.status !== "done") continue;
    if (!(st.command ?? "").includes("systemctl --failed")) continue;
    const body = `${st.stdout ?? ""}\n${st.stderr ?? ""}`;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) units.add(m[1]);
  }
  return units;
}

// 根据原 run 的故障点生成可执行的修复方案（仅固定模板 + 校验过的目标名）
export function buildRepairPlan(run: {
  goal: string | null;
  rootCause: string | null;
  evidence: string | null;
  suggestions: unknown;
  steps: DiagnosisStep[] | unknown;
}): RepairOption[] {
  const steps = (Array.isArray(run.steps) ? run.steps : []) as DiagnosisStep[];
  const goals = `${run.goal ?? ""}\n${run.rootCause ?? ""}\n${String(run.evidence ?? "")}\n${JSON.stringify(run.suggestions ?? "")}`;
  const hints = collectFaultHints(steps, run.goal ?? "", run.rootCause ?? "", String(run.evidence ?? ""));
  const plan: RepairOption[] = [];
  const seen = new Set<string>();
  const add = (o: RepairOption) => {
    if (!seen.has(o.key)) {
      seen.add(o.key);
      plan.push(o);
    }
  };

  if (hints.container && REPAIR_NAME_RE.test(hints.container)) {
    const name = hints.container;
    add({
      key: `docker:start:${name}`,
      kind: "docker_container",
      title: `启动容器 ${name}`,
      detail: `执行 docker start ${name}，恢复已停止容器的运行与其端口映射（原根因：该容器被停止）`,
      risk: "low",
      command: `docker start ${name}`,
      rollback: `docker stop ${name}`,
      target: name,
    });
    add({
      key: `docker:autorestart:${name}`,
      kind: "docker_container",
      title: `设置自动重启 ${name}`,
      detail: `执行 docker update --restart unless-stopped ${name}，容器异常退出或被停止后自动拉起，避免再次失联`,
      risk: "medium",
      command: `docker update --restart unless-stopped ${name}`,
      rollback: `docker update --restart no ${name}`,
      target: name,
    });
  }

  // 仅当故障文本明确点名某个失败 systemd 单元时才提供“启动服务”，避免误操作无关单元
  for (const unit of parseFailedUnits(steps)) {
    if (!REPAIR_NAME_RE.test(unit)) continue;
    const base = unit.replace(/\.service$/i, "");
    if (!goals.toLowerCase().includes(base.toLowerCase())) continue;
    add({
      key: `systemd:start:${unit}`,
      kind: "systemd_service",
      title: `启动服务 ${unit}`,
      detail: `执行 systemctl start ${unit}，恢复失败的服务单元（高风险：会影响该服务器上的运行服务）`,
      risk: "high",
      command: `systemctl start ${unit}`,
      rollback: `systemctl stop ${unit}`,
      target: unit,
    });
  }
  return plan.slice(0, 6);
}

export async function verifyDiagnosis(workspaceId: string, runId: string, db: DbClient) {
  const run = await getRun(workspaceId, runId, db);
  if (!run.serverId) throw AppError.badRequest("该排查未关联服务器，无法复检");
  if (run.status === "running" || run.status === "queued")
    throw AppError.badRequest("排查尚未完成，请等待完成后再复检");
  if (run.status !== "success") throw AppError.badRequest("仅支持对已完成（success）的排查进行复检");

  // AI 接口可配置到工作区设置；未启用时自动回退服务器环境变量
  const llm = await resolveAiLlm(db, workspaceId);
  const existing = (Array.isArray(run.steps) ? run.steps : []) as DiagnosisStep[];
  const rawDomain = extractDomain(run.goal ?? "");
  // 回环地址(127.0.0.1/localhost)不是可对外校验的站点域名，避免把默认站点误当故障目标
  const domain = rawDomain && !/^(127\.|0\.0\.0\.0|localhost|\[::1\])/i.test(rawDomain) ? rawDomain : null;

  // 1) 只读复检计划（由根因/goal 推导 + 原故障点定向复检）
  const hints = collectFaultHints(existing, run.goal ?? "", run.rootCause ?? "", String(run.evidence ?? ""));
  const plan: { tool: string; args: Record<string, unknown>; reason: string; cmd?: string }[] = [];
  if (domain) {
    plan.push({ tool: "web_stack", args: { domain }, reason: "复检：确认 Web 进程、80/443 监听、容器与本机访问" });
    plan.push({ tool: "cert_check", args: { domain }, reason: "复检：真实 HTTPS 握手与证书校验" });
    plan.push({ tool: "http_check", args: { url: `https://${domain}` }, reason: "复检：公网 HTTPS 可达性" });
  } else {
    plan.push({ tool: "network", args: {}, reason: "复检：关键端口监听状态" });
    plan.push({ tool: "services", args: {}, reason: "复检：失败服务列表" });
    plan.push({ tool: "docker", args: { sub: "ps" }, reason: "复检：容器运行状态" });
  }
  if (hints.port) {
    const p = hints.port;
    plan.push({
      tool: `端口 ${p}`,
      args: {},
      reason: `复检：原故障端口 ${p} 监听与可达性`,
      cmd: `echo '=== ss port ${p} ==='; ss -tlnp 2>/dev/null | grep -E ':${p}\\b' || echo "NO_LISTENER port ${p}"; echo '=== probe http://127.0.0.1:${p} ==='; curl -s -m 8 -o /dev/null -w 'http=%{http_code}' 'http://127.0.0.1:${p}/' || echo 'CURL_FAILED connection refused'; echo`,
    });
  }
  if (hints.container) {
    const name = hints.container;
    plan.push({
      tool: `容器 ${name}`,
      args: {},
      reason: `复检：原故障容器 ${name} 运行状态`,
      cmd: `docker ps -a --filter name=${name} --format 'table {{.Names}}\\t{{.Status}}\\t{{.Image}}\\t{{.Ports}}'`,
    });
  }

  const verifySteps: DiagnosisStep[] = [];
  for (const p of plan) {
    const tool = p.cmd ? null : DIAGNOSIS_TOOLS[p.tool];
    const command = p.cmd ?? (tool ? tool.build(p.args) : null);
    const step: DiagnosisStep = {
      index: 0,
      tool: `复检·${p.tool}`,
      args: p.args,
      reason: p.reason,
      command: command ?? "",
      status: "running",
      stdout: "",
      stderr: command ? "" : "参数非法，跳过该步",
      exitCode: null,
      judgment: "",
      startedAt: new Date().toISOString(),
      finishedAt: "",
    };
    if (!command) {
      step.status = "error";
      step.finishedAt = new Date().toISOString();
    } else {
      try {
        const res = await executeShellCommand(workspaceId, run.serverId, { command, timeout: 20_000 }, db);
        step.status = "done";
        step.exitCode = res.exit_code;
        step.stdout = (res.stdout ?? "").slice(0, 4000);
        step.stderr = (res.stderr ?? "").slice(0, 2000);
      } catch (err) {
        step.status = "error";
        step.exitCode = -1;
        step.stderr = String((err as Error).message).slice(0, 1000);
      }
      step.finishedAt = new Date().toISOString();
    }
    verifySteps.push(step);
  }

  // 2) LLM 判定（带重试与确定性兜底）
  const context = verifySteps
    .map(
      (st) =>
        `[${st.tool}] ${st.command || "(无命令)"}\n退出码: ${st.exitCode ?? "-"}\n` +
        `输出: ${(st.stdout + (st.stderr ? "\n[stderr] " + st.stderr : "")).slice(0, 1400)}`
    )
    .join("\n\n");
  const suggestionText = (run.suggestions as { title?: string; detail?: string }[] ?? [])
    .map((sg) => `${sg.title ?? ""}：${sg.detail ?? ""}`)
    .join("；")
    .slice(0, 1000);
  const userPrompt =
    `原始问题：${run.goal ?? ""}\n` +
    `原根因结论：${run.rootCause ?? "（无）"}\n` +
    `修复建议：${suggestionText || "（无）"}\n\n` +
    `本次复检命令与输出：\n${context}\n\n请给出复检判定 JSON。`;

  let verdict: VerifyVerdict | null = null;
  for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
    try {
      const raw = await chatComplete({
        system: attempt > 0 ? VERIFY_SYSTEM_PROMPT + "\n再次强调：只输出一个合法 JSON。" : VERIFY_SYSTEM_PROMPT,
        user: userPrompt,
        apiUrl: llm.apiUrl,
        apiKey: llm.apiKey,
        model: llm.model,
        temperature: 0.2,
        maxTokens: 1024,
        timeoutMs: 90_000,
      });
      const parsed = extractJson<VerifyVerdict>(raw);
      if (parsed && ["recovered", "still_failing", "cannot_verify"].includes(parsed.status)) {
        verdict = parsed;
      }
    } catch (err) {
      console.error("[diagnosis] verify verdict attempt failed:", (err as Error).message);
    }
  }
  if (!verdict) {
    verdict = { status: "cannot_verify", note: "复检命令已执行完毕，但自动判定未返回有效结果，请人工核对上方复检输出。" };
  }

  // 3) 追加复检步骤与判定到时间线
  const label =
    verdict.status === "recovered" ? "已恢复" : verdict.status === "still_failing" ? "仍异常" : "无法核实";
  const verdictStep: DiagnosisStep = {
    index: 0,
    tool: "复检结论",
    args: {},
    reason: "根据复检输出判定故障状态",
    command: "",
    status: verdict.status === "recovered" ? "done" : verdict.status === "still_failing" ? "error" : "done",
    stdout: `判定：${label}\n${verdict.note ?? ""}`,
    stderr: "",
    exitCode: verdict.status === "still_failing" ? 1 : 0,
    judgment: verdict.note ?? "",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
  const allSteps = [...existing, ...verifySteps, verdictStep].map((st, i) => ({ ...st, index: i + 1 }));
  await saveSteps(db, runId, refreshFingerprint(allSteps));

  return getRun(workspaceId, runId, db);
}

// 执行白名单修复：记录审计步骤到时间线，成功后自动触发复检判定“已恢复/仍异常”
export async function executeRepair(
  workspaceId: string,
  runId: string,
  body: { key?: string; confirmed?: boolean },
  db: DbClient
) {
  const run = await getRun(workspaceId, runId, db);
  if (!run.serverId) throw AppError.badRequest("该排查未关联服务器，无法执行修复");
  if (run.status === "running" || run.status === "queued")
    throw AppError.badRequest("排查尚未完成，请等待完成后再执行修复");
  if (run.status !== "success") throw AppError.badRequest("仅支持对已完成（success）的排查执行修复");

  const existing = (Array.isArray(run.steps) ? run.steps : []) as DiagnosisStep[];
  const option = buildRepairPlan(run).find((o) => o.key === body.key);
  if (!option) throw AppError.badRequest("该修复方案不在白名单内，或已不适用于当前排查");
  if (option.risk === "high" && body.confirmed !== true)
    throw AppError.badRequest("该修复属于高风险操作，需二次确认（confirmed: true）后执行");

  const startedAt = new Date().toISOString();
  const stepBase: Omit<DiagnosisStep, "stdout" | "stderr" | "exitCode" | "status" | "judgment"> = {
    index: 0,
    tool: `修复·${option.title}`,
    args: { key: option.key, kind: option.kind, risk: option.risk, target: option.target },
    reason: `修复方案：${option.detail}`,
    command: option.command,
    startedAt,
    finishedAt: "",
  };

  let step: DiagnosisStep;
  try {
    const res = await executeShellCommand(
      workspaceId,
      run.serverId,
      { command: option.command, timeout: 60_000 },
      db
    );
    const ok = res.exit_code === 0;
    step = {
      ...stepBase,
      status: ok ? "done" : "error",
      stdout: (res.stdout ?? "").slice(0, 4000),
      stderr: (res.stderr ?? "").slice(0, 2000),
      exitCode: res.exit_code,
      judgment: ok
        ? `修复命令执行成功（exit 0），已自动发起复检。${option.rollback ? `如需回滚可执行：${option.rollback}` : ""}`
        : `修复命令执行失败（exit ${res.exit_code ?? "-"}），未触发自动复检，请人工核对上方输出。`,
      finishedAt: new Date().toISOString(),
    };
    const stamped = [...existing, step].map((st, i) => ({ ...st, index: i + 1 }));
    await saveSteps(db, runId, refreshFingerprint(stamped));
    if (ok) {
      // 修复成功后自动复检：复检计划会重查原故障端口/容器，判定“已恢复/仍异常/无法核实”
      let after = await verifyDiagnosis(workspaceId, runId, db);
      const verdict = lastVerdict((Array.isArray(after.steps) ? after.steps : []) as DiagnosisStep[]);
      // 失败自动回滚：复检判定仍异常且该方案有回滚命令时，自动撤销本次变更并再次复检（全程审计留痕）
      if (verdict === "still_failing" && option.rollback) {
        const base = (Array.isArray(after.steps) ? after.steps : []) as DiagnosisStep[];
        const rbStartedAt = new Date().toISOString();
        const rbStep: DiagnosisStep = {
          index: base.length + 1,
          tool: `回滚·${option.title}`,
          args: { key: `${option.key}#rollback`, kind: option.kind, target: option.target },
          reason: `自动复检判定故障仍异常，执行回滚撤销本次修复变更（${option.command}）`,
          command: option.rollback,
          status: "running",
          stdout: "",
          stderr: "",
          exitCode: null,
          judgment: "",
          startedAt: rbStartedAt,
          finishedAt: "",
        };
        try {
          const rb = await executeShellCommand(workspaceId, run.serverId, { command: option.rollback, timeout: 30_000 }, db);
          rbStep.status = rb.exit_code === 0 ? "done" : "error";
          rbStep.exitCode = rb.exit_code;
          rbStep.stdout = (rb.stdout ?? "").slice(0, 4000);
          rbStep.stderr = (rb.stderr ?? "").slice(0, 2000);
          rbStep.judgment =
            rb.exit_code === 0
              ? "回滚命令执行成功，已撤销本次修复变更，正在再次复检确认。"
              : `回滚命令执行失败（exit ${rb.exit_code ?? "-"}），请人工介入。`;
        } catch (rbErr) {
          rbStep.status = "error";
          rbStep.exitCode = -1;
          rbStep.stderr = String((rbErr as Error).message ?? rbErr).slice(0, 1000);
          rbStep.judgment = "回滚命令下发失败，请检查服务器 Agent 连接后人工介入。";
        }
        rbStep.finishedAt = new Date().toISOString();
        const rbSteps = refreshFingerprint([...base, rbStep]);
        await saveSteps(db, runId, rbSteps);
        if (rbStep.status === "done") {
          // 回滚成功后再次复检，确认故障点状态
          after = await verifyDiagnosis(workspaceId, runId, db);
        } else {
          after = await getRun(workspaceId, runId, db);
        }
      }
      return after;
    }
  } catch (err) {
    const msg = String((err as Error).message ?? err).slice(0, 1000);
    step = {
      ...stepBase,
      status: "error",
      stdout: "",
      stderr: msg,
      exitCode: -1,
      judgment: "修复命令下发失败，未执行任何变更，请检查服务器 Agent 连接后重试。",
      finishedAt: new Date().toISOString(),
    };
    const stamped = [...existing, step].map((st, i) => ({ ...st, index: i + 1 }));
    await saveSteps(db, runId, stamped);
    throw AppError.badRequest("修复命令下发失败: " + msg);
  }
  return getRun(workspaceId, runId, db);
}

export async function stopDiagnosis(workspaceId: string, runId: string, db: DbClient) {
  // A run that is still waiting in the queue never started: drop it from the
  // queue so the slot is freed immediately instead of after the poll interval.
  queue.cancelQueued(runId);
  const [row] = await db
    .update(diagnosisRuns)
    .set({ status: "stopped", finishedAt: new Date() })
    .where(and(eq(diagnosisRuns.id, runId), eq(diagnosisRuns.workspaceId, workspaceId)))
    .returning({ id: diagnosisRuns.id });
  if (!row) throw AppError.notFound("Diagnosis run", runId);
  return row;
}

// Automatic trigger (cooldown-protected)

export async function maybeStartAutoDiagnosis(
  workspaceId: string,
  serverId: string,
  findings: { level: string; title: string }[],
  db: DbClient
) {
  const errors = findings.filter((f) => f.level === "error" || f.level === "warning");
  if (errors.length === 0) return;

  await recoverStaleRuns(db, serverId);

  const [recent] = await db
    .select({ id: diagnosisRuns.id })
    .from(diagnosisRuns)
    .where(
      and(
        eq(diagnosisRuns.serverId, serverId),
        eq(diagnosisRuns.trigger, "auto"),
        or(eq(diagnosisRuns.status, "running"), eq(diagnosisRuns.status, "queued")),
      )
    )
    .limit(1);
  if (recent) return; // 已有进行中的自动排查

  const [lastAuto] = await db
    .select({ createdAt: diagnosisRuns.createdAt })
    .from(diagnosisRuns)
    .where(and(eq(diagnosisRuns.serverId, serverId), eq(diagnosisRuns.trigger, "auto")))
    .orderBy(desc(diagnosisRuns.createdAt))
    .limit(1);
  if (
    lastAuto &&
    lastAuto.createdAt &&
    Date.now() - lastAuto.createdAt.getTime() < AUTO_TRIGGER_COOLDOWN_MINUTES * 60_000
  ) {
    return; // 冷却期内不重复触发
  }

  const goal = errors
    .slice(0, 3)
    .map((f) => `${f.title}`)
    .join("；")
    .slice(0, 500);

  // 后台异步执行，不阻塞巡检主流程
  setTimeout(() => {
    startDiagnosis(workspaceId, serverId, { goal: `巡检发现异常：${goal}`, trigger: "auto" }, db).catch((e) => {
      console.error("[diagnosis] auto trigger failed:", (e as Error).message);
    });
  }, 0);
}

// Queries

export async function listRuns(workspaceId: string, db: DbClient, limit = 50, serverId?: string) {
  const conds = [eq(diagnosisRuns.workspaceId, workspaceId)];
  if (serverId) conds.push(eq(diagnosisRuns.serverId, serverId));
  const rows = await db
    .select({
      id: diagnosisRuns.id,
      serverId: diagnosisRuns.serverId,
      title: diagnosisRuns.title,
      goal: diagnosisRuns.goal,
      trigger: diagnosisRuns.trigger,
      expertType: diagnosisRuns.expertType,
      status: diagnosisRuns.status,
      rootCause: diagnosisRuns.rootCause,
      confidence: diagnosisRuns.confidence,
      steps: diagnosisRuns.steps,
      createdAt: diagnosisRuns.createdAt,
      finishedAt: diagnosisRuns.finishedAt,
      error: diagnosisRuns.error,
    })
    .from(diagnosisRuns)
    .where(and(...conds))
    .orderBy(desc(diagnosisRuns.createdAt))
    .limit(limit);
  // Live queue position so the list can tell "waiting" from "running".
  return rows.map((r) =>
    r.status === "queued" ? { ...r, queuePosition: queue.queuePosition(r.id) } : r
  );
}

export async function getRun(workspaceId: string, runId: string, db: DbClient) {
  const [row] = await db
    .select()
    .from(diagnosisRuns)
    .where(and(eq(diagnosisRuns.id, runId), eq(diagnosisRuns.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw AppError.notFound("Diagnosis run", runId);
  const steps = (Array.isArray(row.steps) ? row.steps : []) as unknown as DiagnosisStep[];
  const stored = storedFingerprint(steps);
  const enriched = {
    ...row,
    evidenceFingerprint: stored,
    evidenceVerified: stored ? computeEvidenceFingerprint(steps) === stored : null,
    similarCases: row.status === "success" ? await findSimilarCases(row, db) : [],
    queuePosition: row.status === "queued" ? queue.queuePosition(runId) : 0,
  };
  return enriched;
}

export async function deleteRun(workspaceId: string, runId: string, db: DbClient) {
  const [row] = await db
    .delete(diagnosisRuns)
    .where(and(eq(diagnosisRuns.id, runId), eq(diagnosisRuns.workspaceId, workspaceId)))
    .returning({ id: diagnosisRuns.id });
  if (!row) throw AppError.notFound("Diagnosis run", runId);
  return row;
}
