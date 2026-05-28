type TerminalState = "connecting" | "connected" | "disconnected" | "error";
type StateListener = (state: TerminalState) => void;
type DataHandler = (data: ArrayBuffer | string) => void;

export class TerminalWsClient {
  private ws: WebSocket | null = null;
  private state: TerminalState = "disconnected";
  private stateListeners = new Set<StateListener>();
  private dataHandlers = new Set<DataHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private maxAttempts = 5;
  private connectParams: { serverId: string; workspaceId: string; token: string } | null = null;

  connect(serverId: string, workspaceId: string, token: string) {
    this.attempts = 0;
    this.connectParams = { serverId, workspaceId, token };
    const base = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001/ws";
    const url = `${base}/terminal?token=${encodeURIComponent(token)}&workspaceId=${encodeURIComponent(workspaceId)}&serverId=${encodeURIComponent(serverId)}`;

    this.setState("connecting");
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.setState("connected");
      this.attempts = 0;
    };

    this.ws.onmessage = (e: MessageEvent) => {
      this.dataHandlers.forEach((h) => h(e.data));
    };

    this.ws.onclose = () => {
      this.setState("disconnected");
      if (this.attempts < this.maxAttempts && this.connectParams) {
        const delay = Math.min(1000 * Math.pow(2, this.attempts), 10000);
        this.attempts++;
        this.reconnectTimer = setTimeout(() => {
          if (this.connectParams) {
            this.connect(
              this.connectParams.serverId,
              this.connectParams.workspaceId,
              this.connectParams.token
            );
          }
        }, delay);
      } else if (this.attempts >= this.maxAttempts) {
        this.setState("error");
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  send(data: string | ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  sendResize(cols: number, rows: number) {
    this.send(JSON.stringify({ type: "resize", cols, rows }));
  }

  disconnect() {
    this.connectParams = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempts = this.maxAttempts;
    this.ws?.close(1000);
    this.ws = null;
    this.setState("disconnected");
  }

  onStateChange(fn: StateListener) {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  onData(fn: DataHandler) {
    this.dataHandlers.add(fn);
    return () => this.dataHandlers.delete(fn);
  }

  getState() {
    return this.state;
  }

  private setState(s: TerminalState) {
    this.state = s;
    this.stateListeners.forEach((fn) => fn(s));
  }
}

export const terminalWsClient = new TerminalWsClient();
