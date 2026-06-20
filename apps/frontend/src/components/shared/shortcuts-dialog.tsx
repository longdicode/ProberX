"use client";

import { useEffect, useState, useCallback } from "react";
import { Keyboard } from "lucide-react";

const sections = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["Cmd", "K"], description: "Open command palette" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: ["Cmd", "\\"], description: "Toggle sidebar" },
      { keys: ["G", "O"], description: "Go to Overview" },
      { keys: ["G", "S"], description: "Go to Servers" },
      { keys: ["G", "M"], description: "Go to Monitors" },
      { keys: ["G", "A"], description: "Go to Alerts" },
      { keys: ["G", "T"], description: "Go to Tasks" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["Esc"], description: "Close modal / dialog" },
      { keys: ["Enter"], description: "Confirm / submit" },
      { keys: ["F"], description: "Toggle fullscreen" },
    ],
  },
  {
    title: "Theme",
    shortcuts: [
      { keys: ["Click"], description: "Cycle theme: Light → Dark → System" },
    ],
  },
];

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      setOpen((prev) => !prev);
    }
    if (e.key === "Escape") setOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const isMac = typeof navigator !== "undefined" && navigator.platform?.toLowerCase().includes("mac");

  function renderKey(key: string) {
    if (key === "Cmd") return isMac ? "⌘" : "Ctrl";
    return key;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-md mx-4 bg-card border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <Keyboard className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">{section.title}</h3>
              <div className="space-y-2">
                {section.shortcuts.map((s) => (
                  <div key={s.description} className="flex items-center justify-between gap-4">
                    <span className="text-sm">{s.description}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {s.keys.map((k, i) => (
                        <span key={i}>
                          <kbd className="text-[11px] px-1.5 py-0.5 rounded bg-muted border font-medium">{renderKey(k)}</kbd>
                          {i < s.keys.length - 1 && <span className="text-muted-foreground mx-0.5 text-xs">+</span>}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t bg-muted/30">
          <p className="text-[11px] text-muted-foreground">Press <kbd className="text-[11px] px-1 py-0.5 rounded bg-muted border">?</kbd> to toggle this dialog.</p>
        </div>
      </div>
    </div>
  );
}
