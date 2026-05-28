"use client";

import { useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { wsClient } from "@/lib/ws-client";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function useWebSocket() {
  const { isAuthenticated, token } = useAuthStore();
  const current = useWorkspaceStore((s) => s.current);
  const widRef = useRef<string | null>(null);

  const state = useSyncExternalStore(
    (cb) => wsClient.onStateChange(cb),
    () => wsClient.state
  );

  useEffect(() => {
    if (!isAuthenticated) {
      wsClient.disconnect();
      return;
    }
    const wid = current?.id;
    if (!wid) return;

    if (widRef.current !== wid) {
      wsClient.disconnect();
      widRef.current = wid;
    }
    wsClient.connect(wid, token || undefined);
  }, [isAuthenticated, current?.id, token]);

  const subscribe = useCallback((type: string, handler: (payload: unknown) => void) => {
    wsClient.send("subscribe", { channels: [type] });
    const unsub = wsClient.on(type, (msg) => handler(msg.payload));
    return () => {
      wsClient.send("unsubscribe", { channels: [type] });
      unsub();
    };
  }, []);

  const send = useCallback((type: string, payload: unknown) => {
    wsClient.send(type, payload);
  }, []);

  return { subscribe, send, state };
}
