"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { terminalWsClient } from "@/lib/terminal-ws";
import { getToken } from "@/lib/auth";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { JSX } from "react";

interface TerminalComponentProps {
  serverId: string;
  onStateChange?: (state: string) => void;
}

const theme = {
  background: "#1a1b26",
  foreground: "#c0caf5",
  cursor: "#c0caf5",
  selectionBackground: "#33467c",
  black: "#15161e",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#a9b1d6",
  brightBlack: "#414868",
  brightRed: "#f7768e",
  brightGreen: "#9ece6a",
  brightYellow: "#e0af68",
  brightBlue: "#7aa2f7",
  brightMagenta: "#bb9af7",
  brightCyan: "#7dcfff",
  brightWhite: "#c0caf5",
};

export function TerminalComponent({ serverId, onStateChange }: TerminalComponentProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const current = useWorkspaceStore((s) => s.current);

  useEffect(() => {
    if (!containerRef.current || !current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme,
      scrollback: 5000,
      tabStopWidth: 4,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      terminalWsClient.send(data);
    });

    const unsubData = terminalWsClient.onData((data) => {
      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data);
          if (msg.type === "terminal:ready") {
            onStateChange?.("connected");
            fitAddonRef.current?.fit();
            const dims = fitAddonRef.current?.proposeDimensions();
            if (dims) terminalWsClient.sendResize(dims.cols, dims.rows);
          } else if (msg.type === "terminal:closed") {
            term.writeln("\r\n\x1b[33m--- Connection closed ---\x1b[0m");
            onStateChange?.("disconnected");
          } else if (msg.type === "terminal:error") {
            term.writeln(`\r\n\x1b[31m--- ${msg.payload?.message || "Error"} ---\x1b[0m`);
            onStateChange?.("error");
          }
        } catch {
          term.write(data);
        }
      } else {
        term.write(new Uint8Array(data as ArrayBuffer));
      }
    });

    const unsubState = terminalWsClient.onStateChange((state) => {
      onStateChange?.(state);
      if (state === "connected") {
        term.writeln("\x1b[32m--- Connected ---\x1b[0m");
      } else if (state === "connecting") {
        term.writeln("\x1b[33mConnecting...\x1b[0m");
      } else if (state === "error") {
        term.writeln("\x1b[31m--- Connection failed. Check agent status. ---\x1b[0m");
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) terminalWsClient.sendResize(dims.cols, dims.rows);
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(containerRef.current);

    const token = getToken();
    if (token) {
      terminalWsClient.connect(serverId, current.id, token);
    }

    return () => {
      unsubData();
      unsubState();
      ro.disconnect();
      terminalWsClient.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [serverId, current?.id]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[500px] rounded-b-lg overflow-hidden border-x border-b border-border/50"
      style={{ backgroundColor: theme.background }}
    />
  );
}
