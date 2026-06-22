"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { useLocale } from "@/stores/locale-store";
import {
  LayoutDashboard, Server, Eye, Bell, Timer, Shield, Wrench, Settings,
  ChevronLeft, ChevronRight, Radio, Terminal,
} from "lucide-react";
import { WorkspaceSwitcher } from "./workspace-switcher";


export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, sidebarCollapsed, setSidebarCollapsed } = useUiStore();
  const { t } = useLocale();

  const navItems = [
    { href: "/overview", label: t("nav.overview"), icon: LayoutDashboard },
    { href: "/servers", label: t("nav.servers"), icon: Server },
    { href: "/monitors", label: t("nav.monitors"), icon: Eye },
    { href: "/alerts", label: t("nav.alerts"), icon: Bell },
    { href: "/tasks", label: t("nav.tasks"), icon: Timer },
    { href: "/firewall", label: t("nav.firewall"), icon: Shield },
    { href: "/tools", label: t("nav.tools"), icon: Wrench },
    { href: "/ai-terminal", label: t("nav.aiTerminal"), icon: Terminal },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];
  if (!sidebarOpen) return null;

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
      sidebarCollapsed ? "w-16" : "w-60"
    )}>
      <div className={cn("flex items-center gap-2 px-4 h-14 border-b border-sidebar-border", sidebarCollapsed && "justify-center px-2")}>
        <Radio className="w-6 h-6 text-primary shrink-0" />
        {!sidebarCollapsed && <span className="font-semibold text-sm">{t("sidebar.brand")}</span>}
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="ml-auto text-muted-foreground hover:text-foreground shrink-0">
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {!sidebarCollapsed && <WorkspaceSwitcher />}

      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              sidebarCollapsed && "justify-center px-2",
              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50"
            )} title={sidebarCollapsed ? label : undefined}>
              <Icon className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {!sidebarCollapsed && (
        <div className="px-4 py-3 border-t border-sidebar-border text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            {t("sidebar.systemOperational")}
          </div>
        </div>
      )}
    </aside>
  );
}
