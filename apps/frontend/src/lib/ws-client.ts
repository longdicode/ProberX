import { getToken } from "./auth";
import { WS_BASE_URL } from "./constants";

type MessageHandler = (msg: { id: string; type: string; payload: unknown; timestamp: number }) => void;
type StateListener = (state: string) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;
  private handlers = new Map<string, Set<MessageHandler>>();
  private globalHandlers = new Set<MessageHandler>();
  private _state: "connecting" | "connected" | "disconnected" | "reconnecting" = "disconnected";
  private stateListeners = new Set<StateListener>();
  private _workspaceId = "";
  private _token = "";

  get state() { return this._state; }

  private setState(s: typeof this._state) {
    if (this._state === s) return;
    this._state = s;
    this.stateListeners.forEach((fn) => fn(s));
  }

  onStateChange(fn: StateListener) {
    this.stateListeners.add(fn);
    return () => { this.stateListeners.delete(fn); };
  }

  connect(workspaceId: string, token?: string) {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const t = token || getToken();
    if (!t) return;
    this._workspaceId = workspaceId;
    this._token = t;
    this.setState("connecting");
    this.ws = new WebSocket(`${WS_BASE_URL}?token=${encodeURIComponent(t)}&workspaceId=${encodeURIComponent(workspaceId)}`);

    this.ws.onopen = () => {
      this.setState("connected");
      this.attempts = 0;
      this.pingTimer = setInterval(() => this.send("ping", {}), 30000);
    };

    this.ws.onmessage = (e) => {
      try { const m = JSON.parse(e.data); this.dispatch(m); } catch { /* ignore */ }
    };

    this.ws.onclose = () => {
      this.setState("disconnected");
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      const delay = Math.min(1000 * Math.pow(2, this.attempts), 60000);
      this.attempts++;
      this.setState("reconnecting");
      this.reconnectTimer = setTimeout(() => this.connect(this._workspaceId, this._token), delay);
    };

    this.ws.onerror = () => this.ws?.close();
  }

  disconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.ws?.close(1000);
    this.ws = null;
    this.setState("disconnected");
  }

  send(type: string, payload: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msgId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.ws.send(JSON.stringify({ id: msgId, type, payload, timestamp: Date.now() }));
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => { this.handlers.get(type)?.delete(handler); };
  }

  onMessage(handler: MessageHandler) {
    this.globalHandlers.add(handler);
    return () => { this.globalHandlers.delete(handler); };
  }

  private dispatch(msg: { id: string; type: string; payload: unknown; timestamp: number }) {
    this.handlers.get(msg.type)?.forEach((h) => h(msg));
    this.globalHandlers.forEach((h) => h(msg));
  }
}

export const wsClient = new WsClient();
