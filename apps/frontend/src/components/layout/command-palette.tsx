"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/stores/ui-store";
import { useLocale } from "@/stores/locale-store";
import { LayoutDashboard, Server, Eye, Bell, Timer, Shield, Wrench, Settings, Search } from "lucide-react";

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUiStore();
  const { t } = useLocale();
  const router = useRouter();

  const actions = [
    { id: "overview", label: t("command.goToOverview"), icon: LayoutDashboard, href: "/overview" },
    { id: "servers", label: t("command.goToServers"), icon: Server, href: "/servers" },
    { id: "monitors", label: t("command.goToMonitors"), icon: Eye, href: "/monitors" },
    { id: "alerts", label: t("command.goToAlerts"), icon: Bell, href: "/alerts" },
    { id: "tasks", label: t("command.goToTasks"), icon: Timer, href: "/tasks" },
    { id: "firewall", label: t("command.goToFirewall"), icon: Shield, href: "/firewall" },
    { id: "tools", label: t("command.goToTools"), icon: Wrench, href: "/tools" },
    { id: "settings", label: t("command.goToSettings"), icon: Settings, href: "/settings" },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCommandPaletteOpen(!commandPaletteOpen); }
    if (e.key === "Escape") setCommandPaletteOpen(false);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!commandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setCommandPaletteOpen(false)} />
      <div className="relative z-50 w-full max-w-lg mx-4 bg-card border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder={t("command.placeholder")} className="flex-1 bg-transparent text-sm outline-none" autoFocus />
          <kbd className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted border">{t("command.esc")}</kbd>
        </div>
        <div className="py-2 max-h-64 overflow-y-auto">
          {actions.map(({ id, label, icon: Icon, href }) => (
            <button key={id} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
              onClick={() => { router.push(href); setCommandPaletteOpen(false); }}>
              <Icon className="w-4 h-4 text-muted-foreground" />{label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
