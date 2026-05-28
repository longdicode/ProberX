import { WebSocket } from "ws";

interface ClientConnection {
  socket: WebSocket;
  userId: string;
  workspaceId: string;
  connectedAt: number;
}

class ConnectionManager {
  private clients = new Map<string, ClientConnection>();
  private workspaceClients = new Map<string, Set<string>>();
  private subscriptions = new Map<string, Set<string>>();

  add(userId: string, socket: WebSocket, workspaceId: string) {
    this.clients.set(userId, { socket, userId, workspaceId, connectedAt: Date.now() });

    let wsClients = this.workspaceClients.get(workspaceId);
    if (!wsClients) {
      wsClients = new Set();
      this.workspaceClients.set(workspaceId, wsClients);
    }
    wsClients.add(userId);
  }

  remove(userId: string) {
    const client = this.clients.get(userId);
    if (client) {
      const wsClients = this.workspaceClients.get(client.workspaceId);
      if (wsClients) {
        wsClients.delete(userId);
        if (wsClients.size === 0) this.workspaceClients.delete(client.workspaceId);
      }
    }
    this.clients.delete(userId);
    this.subscriptions.delete(userId);
  }

  subscribe(userId: string, channels: string[]) {
    if (!this.subscriptions.has(userId)) {
      this.subscriptions.set(userId, new Set());
    }
    const subs = this.subscriptions.get(userId)!;
    for (const ch of channels) subs.add(ch);
  }

  unsubscribe(userId: string, channels: string[]) {
    const subs = this.subscriptions.get(userId);
    if (!subs) return;
    for (const ch of channels) subs.delete(ch);
    if (subs.size === 0) this.subscriptions.delete(userId);
  }

  getSubscriptions(userId: string): Set<string> {
    return this.subscriptions.get(userId) ?? new Set();
  }

  sendToUser(userId: string, data: string): boolean {
    const client = this.clients.get(userId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) return false;
    client.socket.send(data);
    return true;
  }

  broadcastToWorkspace(workspaceId: string, data: string) {
    const wsClients = this.workspaceClients.get(workspaceId);
    if (!wsClients) return;
    for (const clientId of wsClients) {
      this.sendToUser(clientId, data);
    }
  }

  getWorkspaceClientCount(workspaceId: string): number {
    return this.workspaceClients.get(workspaceId)?.size ?? 0;
  }

  getTotalClients(): number {
    return this.clients.size;
  }
}

export const connectionManager = new ConnectionManager();
