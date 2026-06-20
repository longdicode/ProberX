"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/layout/command-palette";
import { ShortcutsDialog } from "@/components/shared/shortcuts-dialog";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, sidebarCollapsed } = useUiStore();
  return (
    <div className="min-h-screen">
      <Sidebar />
      <CommandPalette />
      <ShortcutsDialog />
      <div className={cn("flex flex-col transition-all duration-200", sidebarOpen ? (sidebarCollapsed ? "ml-16" : "ml-60") : "ml-0")}>
        <Header />
        <main className="flex-1 p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
