"use client";

import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces, useDashboard, useAlertEvents, useAlertTrends, useServerComparison } from "@/hooks/use-api";
import { api } from "@/lib/api-client";

export function useDashboardData() {
  const queryClient = useQueryClient();
  const { current, setCurrent } = useWorkspaceStore();
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces();
  const [trendRange, setTrendRange] = useState<string>("7d");
  const { data: dashboard, isLoading, error } = useDashboard(current?.id);
  const { data: recentAlerts } = useAlertEvents(current?.id);
  const { data: alertTrends } = useAlertTrends(current?.id, trendRange);
  const { data: serverComp } = useServerComparison(current?.id);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-select first workspace when none is selected
  useEffect(() => {
    if (!current && workspaces && workspaces.length > 0) {
      setCurrent(workspaces[0]);
    }
  }, [workspaces, current, setCurrent]);

  const handleCreateWorkspace = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const ws = await api.post<{ id: string; name: string; plan: string }>("/workspaces", { name: "My Workspace" });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setCurrent({ id: ws.id, name: ws.name, plan: ws.plan, settings: {} });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create workspace";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return {
    current,
    workspaces,
    wsLoading,
    dashboard,
    isLoading,
    error,
    recentAlerts,
    alertTrends,
    serverComp,
    creating,
    createError,
    trendRange,
    setTrendRange,
    isFullscreen,
    toggleFullscreen,
    handleCreateWorkspace,
  };
}
