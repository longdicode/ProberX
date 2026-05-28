"use client";

import { Wifi, WifiOff, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JSX } from "react";

interface ConnectionBarProps {
  state: string;
  onReconnect?: () => void;
}

const stateConfig: Record<string, {
  icon: typeof Wifi;
  color: string;
  label: string;
  bg: string;
  spin?: boolean;
}> = {
  connected: { icon: Wifi, color: "text-green-500", label: "Connected", bg: "bg-green-500/10" },
  connecting: { icon: Loader2, color: "text-yellow-500", label: "Connecting...", bg: "bg-yellow-500/10", spin: true },
  reconnecting: { icon: RefreshCw, color: "text-yellow-500", label: "Reconnecting...", bg: "bg-yellow-500/10", spin: true },
  disconnected: { icon: WifiOff, color: "text-muted-foreground", label: "Disconnected", bg: "bg-muted" },
  error: { icon: AlertTriangle, color: "text-red-500", label: "Connection Error", bg: "bg-red-500/10" },
};

export function TerminalConnectionBar({ state, onReconnect }: ConnectionBarProps): JSX.Element {
  const cfg = stateConfig[state] ?? stateConfig.disconnected;
  const Icon = cfg.icon;

  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-t-lg ${cfg.bg} border-x border-t border-border/50`}>
      <div className="flex items-center gap-2 text-xs">
        <Icon className={`w-3.5 h-3.5 ${cfg.color} ${cfg.spin ? "animate-spin" : ""}`} />
        <span className={cfg.color}>{cfg.label}</span>
      </div>
      {(state === "disconnected" || state === "error") && onReconnect ? (
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onReconnect}>
          Reconnect
        </Button>
      ) : null}
    </div>
  );
}
