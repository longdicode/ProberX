import { Client } from "ssh2";
import { AppError } from "../utils/errors";

export interface SshOptions {
  host: string;
  port?: number;
  username?: string;
  password: string;
}

export interface AgentInstallOptions {
  dashboardUrl: string;
  agentToken: string;
  agentId: string;
  downloadBase?: string;
}

export interface AgentInstallResult {
  success: boolean;
  log: string;
}

/** Live install task state kept in memory for SSE streaming. */
export interface InstallTaskHandle {
  serverId: string;
  lines: string;
  done: boolean;
  success: boolean;
  listeners: Set<(lines: string, done: boolean, success: boolean) => void>;
}

const installTasks = new Map<string, InstallTaskHandle>();

/** Returns the active (or finished) install task for a server id. */
export function getInstallTask(serverId: string): InstallTaskHandle | undefined {
  return installTasks.get(serverId);
}

/** Starts a background install task and returns its handle immediately. */
export function startInstallTask(
  serverId: string,
  run: (push: (chunk: string) => void) => Promise<boolean>,
): InstallTaskHandle {
  const task: InstallTaskHandle = { serverId, lines: "", done: false, success: false, listeners: new Set() };
  installTasks.set(serverId, task);
  const push = (chunk: string) => {
    task.lines += chunk;
    for (const l of task.listeners) l(task.lines, false, false);
  };
  run(push)
    .then((ok) => {
      task.done = true;
      task.success = ok;
      for (const l of task.listeners) l(task.lines, true, ok);
    })
    .catch((err) => {
      task.done = true;
      task.success = false;
      task.lines += "\n[error] " + (err instanceof Error ? err.message : String(err)) + "\n";
      for (const l of task.listeners) l(task.lines, true, false);
    });
  return task;
}

/**
 * Builds a self-contained bash script that installs the ProberX agent on the
 * remote host: downloads the binary, writes the systemd unit, starts it.
 */
export function buildInstallScript(opts: AgentInstallOptions): string {
  const downloadBase = opts.downloadBase || "https://panel.yqone.cn/downloads";
  return `
set -e
DASHBOARD_URL='${opts.dashboardUrl}'
AGENT_TOKEN='${opts.agentToken}'
AGENT_ID='${opts.agentId}'
DOWNLOAD_BASE='${downloadBase}'

SUDO=""
if [ "$(id -u)" != "0" ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "ERROR: must run as root or have sudo"
    exit 1
  fi
fi

echo "=== ProberX Agent Online Install ==="
echo "Dashboard : $DASHBOARD_URL"
echo "Agent ID  : $AGENT_ID"

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  BIN_ARCH="amd64" ;;
  aarch64) BIN_ARCH="arm64" ;;
  *)       echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

echo "[1/4] Downloading agent (\${BIN_ARCH})..."
curl -fsSL "$DOWNLOAD_BASE/proberx-agent-linux-$BIN_ARCH" -o /tmp/proberx-agent
$SUDO systemctl stop proberx-agent 2>/dev/null || true
$SUDO cp /tmp/proberx-agent /usr/local/bin/proberx-agent
$SUDO chmod +x /usr/local/bin/proberx-agent
rm -f /tmp/proberx-agent
echo "       Installed to /usr/local/bin/proberx-agent"

echo "[2/4] Writing systemd unit..."
cat > /tmp/proberx-agent.service << 'SERVICE_EOF'
[Unit]
Description=ProberX Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/proberx-agent
Environment="DASHBOARD_URL=${opts.dashboardUrl}"
Environment="AGENT_ID=${opts.agentId}"
Environment="AGENT_TOKEN=${opts.agentToken}"
Environment="AGENT_PORT=9800"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE_EOF
$SUDO cp /tmp/proberx-agent.service /etc/systemd/system/proberx-agent.service
rm -f /tmp/proberx-agent.service

echo "[3/4] Enabling service..."
$SUDO systemctl daemon-reload
$SUDO systemctl enable proberx-agent >/dev/null 2>&1 || true

echo "[4/4] Starting agent..."
$SUDO systemctl restart proberx-agent
sleep 2
if $SUDO systemctl is-active --quiet proberx-agent; then
  echo "INSTALL_OK"
else
  echo "INSTALL_FAIL"
  echo "--- journalctl -u proberx-agent ---"
  $SUDO journalctl -u proberx-agent -n 20 --no-pager || true
  exit 1
fi
`;
}

/** Connects to a remote host via SSH and runs a script. */
function runRemoteScript(
  ssh: SshOptions,
  script: string,
  onData?: (chunk: string) => void,
  timeoutMs = 150_000,
): Promise<AgentInstallResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const lines: string[] = [];
    const push = (chunk: Buffer | string) => {
      const text = chunk.toString();
      lines.push(text);
      if (onData) onData(text);
    };
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      if (err) reject(err);
      else resolve({ success: true, log: lines.join("").trim() });
    };

    const timer = setTimeout(() => finish(new AppError(408, "SSH_TIMEOUT", "SSH install timed out after " + Math.round(timeoutMs / 1000) + "s")), timeoutMs);

    conn.on("ready", () => {
      push("[ssh] connected to " + ssh.host + "\n");
      conn.exec(script, { pty: { term: "xterm", rows: 60, cols: 160 } }, (err, stream) => {
        if (err) {
          finish(new AppError(500, "SSH_EXEC_FAILED", "SSH exec failed: " + err.message));
          return;
        }
        stream.on("close", (code: number) => {
          if (code === 0) finish();
          else {
            clearTimeout(timer);
            settled = true;
            conn.end();
            resolve({ success: false, log: lines.join("").trim() });
          }
        });
        stream.on("data", push);
        stream.stderr.on("data", push);
      });
    });

    conn.on("error", (err) => finish(new AppError(400, "SSH_CONNECT_FAILED", "SSH connection to " + ssh.host + " failed: " + err.message)));

    conn.connect({
      host: ssh.host,
      port: ssh.port || 22,
      username: ssh.username || "root",
      password: ssh.password,
      readyTimeout: 20_000,
      keepaliveInterval: 10_000,
    });
  });
}

/** Connects to a remote host via SSH and installs the ProberX agent. */
export function installAgentViaSsh(
  ssh: SshOptions,
  opts: AgentInstallOptions,
  onData?: (chunk: string) => void,
  timeoutMs = 150_000,
): Promise<AgentInstallResult> {
  return runRemoteScript(ssh, buildInstallScript(opts), onData, timeoutMs);
}

/** Builds a bash script that stops, disables and removes the ProberX agent. */
export function buildUninstallScript(): string {
  return `
set -e
SUDO=""
if [ "$(id -u)" != "0" ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "ERROR: must run as root or have sudo"
    exit 1
  fi
fi

echo "=== ProberX Agent Uninstall ==="

if $SUDO systemctl list-unit-files --type=service 2>/dev/null | grep -q '^proberx-agent'; then
  echo "[1/3] Stopping service..."
  $SUDO systemctl stop proberx-agent 2>/dev/null || true
  echo "[2/3] Disabling service..."
  $SUDO systemctl disable proberx-agent 2>/dev/null || true
  $SUDO rm -f /etc/systemd/system/proberx-agent.service
  $SUDO systemctl daemon-reload
  $SUDO systemctl reset-failed proberx-agent 2>/dev/null || true
  echo "       Service removed"
else
  echo "[1/3] No proberx-agent service found"
fi

if [ -f /usr/local/bin/proberx-agent ]; then
  echo "[2/3] Removing binary..."
  $SUDO rm -f /usr/local/bin/proberx-agent
  echo "       Binary removed"
else
  echo "[2/3] No binary found"
fi

echo "[3/3] Cleaning up..."
$SUDO rm -f /opt/proberx/agent 2>/dev/null || true
echo "UNINSTALL_OK"
`;
}

/** Connects to a remote host via SSH and uninstalls the ProberX agent. */
export function uninstallAgentViaSsh(
  ssh: SshOptions,
  onData?: (chunk: string) => void,
  timeoutMs = 90_000,
): Promise<AgentInstallResult> {
  return runRemoteScript(ssh, buildUninstallScript(), onData, timeoutMs);
}
