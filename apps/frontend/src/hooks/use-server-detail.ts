"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useServers, useServerMetrics, type MetricSnapshot } from "@/hooks/use-api";
import { useWebSocket } from "@/hooks/use-websocket";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { useLocale } from "@/stores/locale-store";

interface EditForm {
  name: string;
  agentHost: string;
  agentPort: string;
}

export function useServerDetail(wid: string | undefined, sid: string) {
  const { t } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { subscribe } = useWebSocket();

  const { data: servers, isLoading: serverLoading, error: serverError } = useServers(wid);
  const server = servers?.find((s) => s.id === sid);

  const [metricRange, setMetricRange] = useState("6h");
  const { data: metrics, isLoading: metricsLoading } = useServerMetrics(wid, sid, metricRange);
  const [liveMetric, setLiveMetric] = useState<MetricSnapshot | null>(null);
  const [liveOnline, setLiveOnline] = useState<boolean | null>(null);

  // Process list
  const [processes, setProcesses] = useState<{ pid: number; name: string; cpu_percent: number; mem_mb: number }[] | null>(null);
  const [procLoading, setProcLoading] = useState(false);

  const fetchProcesses = useCallback(async () => {
    if (!wid) return;
    setProcLoading(true);
    try {
      const res = await api.get<{ pid: number; name: string; cpu_percent: number; mem_mb: number }[]>(`/workspaces/${wid}/servers/${sid}/processes`);
      setProcesses(res);
    } catch { setProcesses([]); }
    finally { setProcLoading(false); }
  }, [wid, sid]);

  // Playback controls
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reversedMetrics = useMemo(() => (metrics ?? []).slice().reverse(), [metrics]);
  const playbackSnapshot = playbackIndex >= 0 ? reversedMetrics[playbackIndex] : null;

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playbackRef.current) { clearInterval(playbackRef.current); playbackRef.current = null; }
  }, []);

  const startPlayback = useCallback(() => {
    if (reversedMetrics.length === 0) return;
    stopPlayback();
    setIsPlaying(true);
    const startIdx = playbackIndex >= 0 ? playbackIndex : 0;
    setPlaybackIndex(startIdx);
    let idx = startIdx;
    playbackRef.current = setInterval(() => {
      idx++;
      if (idx >= reversedMetrics.length) {
        idx = reversedMetrics.length - 1;
        stopPlayback();
      }
      setPlaybackIndex(idx);
    }, 1000 / playbackSpeed);
  }, [reversedMetrics, playbackIndex, playbackSpeed, stopPlayback]);

  const resetPlayback = useCallback(() => {
    stopPlayback();
    setPlaybackIndex(-1);
  }, [stopPlayback]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  // WebSocket subscriptions
  useEffect(() => {
    const unsubMetrics = subscribe("metrics:update", (payload: unknown) => {
      const m = payload as { serverId: string } & MetricSnapshot;
      if (m?.serverId === sid) setLiveMetric(m as MetricSnapshot);
    });
    const unsubStatus = subscribe("server:status", (payload: unknown) => {
      const s = payload as { serverId: string; isOnline: boolean };
      if (s?.serverId === sid) setLiveOnline(s.isOnline);
    });
    return () => { unsubMetrics(); unsubStatus(); };
  }, [sid, subscribe]);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", agentHost: "", agentPort: "9800" });
  const [submitting, setSubmitting] = useState(false);

  function openEditDialog() {
    if (!server) return;
    const hostInfo = server.hostInfo as Record<string, unknown> | null;
    setEditForm({
      name: server.name,
      agentHost: (hostInfo?.agent_host as string) || "",
      agentPort: String(hostInfo?.agent_port ?? "9800"),
    });
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!wid || !server) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name: editForm.name };
      if (editForm.agentHost.trim()) body.agentHost = editForm.agentHost.trim();
      const port = parseInt(editForm.agentPort, 10);
      if (!isNaN(port)) body.agentPort = port;
      await api.patch(`/workspaces/${wid}/servers/${sid}`, body);
      queryClient.invalidateQueries({ queryKey: ["servers", wid] });
      toast.success(t("servers.serverUpdated"));
      setEditOpen(false);
    } catch (err) {
      console.error("edit server:", err);
      toast.error(err instanceof Error ? err.message : t("servers.updateFailed"));
    } finally { setSubmitting(false); }
  }

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!wid || !deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/workspaces/${wid}/servers/${deleteTarget.id}`);
      queryClient.invalidateQueries({ queryKey: ["servers", wid] });
      toast.success(t("servers.serverDeleted"));
      router.push("/servers");
    } catch (err) {
      console.error("delete server:", err);
      toast.error(err instanceof Error ? err.message : t("servers.deleteFailed"));
    } finally { setDeleting(false); setDeleteTarget(null); }
  }

  // Build chart data
  function buildChartData(data: MetricSnapshot[]) {
    return (data ?? []).slice().reverse().map((m) => ({
      time: new Date(m.time).toLocaleTimeString(),
      cpu: m.cpuPercent ? Number(m.cpuPercent) : 0,
      mem: m.memUsed && m.memTotal ? ((m.memUsed / m.memTotal) * 100).toFixed(1) : 0,
      net_in: m.netInBytes ? m.netInBytes / 1024 / 1024 : 0,
      net_out: m.netOutBytes ? m.netOutBytes / 1024 / 1024 : 0,
      gpu: m.gpuUtilPercent ? Number(m.gpuUtilPercent) : 0,
      gpu_temp: m.gpuTemp ? Number(m.gpuTemp) : 0,
    }));
  }

  const isOnline = liveOnline ?? server?.isOnline;
  const merged = liveMetric ?? (playbackSnapshot ?? metrics?.[0]);
  const chartData = buildChartData(metrics ?? []);
  const latestMetrics = metrics?.[0];

  return {
    server,
    serverLoading,
    serverError,
    isOnline,
    merged,
    latestMetrics,
    chartData,
    playbackIndex,
    isPlaying,
    playbackSpeed,
    playbackSnapshot,
    reversedMetrics,
    metricRange,
    setMetricRange,
    startPlayback,
    stopPlayback,
    resetPlayback,
    setPlaybackIndex,
    setPlaybackSpeed,
    processes,
    procLoading,
    fetchProcesses,
    editOpen,
    setEditOpen,
    editForm,
    setEditForm,
    submitting,
    handleEdit,
    deleteTarget,
    setDeleteTarget,
    deleting,
    handleDelete,
    openEditDialog,
  };
}
