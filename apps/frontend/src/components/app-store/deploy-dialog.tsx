"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AppStoreEntry } from "@/hooks/use-api";

interface DeployDialogProps {
  entry: AppStoreEntry | null;
  serverId: string;
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeployed: () => void;
}

export function DeployDialog({ entry, serverId, workspaceId, open, onOpenChange, onDeployed }: DeployDialogProps) {
  const [appName, setAppName] = useState("");
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [memoryLimit, setMemoryLimit] = useState("");
  const [cpuLimit, setCpuLimit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progressLogs, setProgressLogs] = useState("");
  const [portStatus, setPortStatus] = useState<Record<string, boolean>>({});
  const [deployDone, setDeployDone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const portTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when dialog opens with a new entry
  useEffect(() => {
    if (entry) {
      const safe = entry.name.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30);
      setAppName(safe);
      setEnvValues(entry.defaultEnv || {});
      setMemoryLimit(entry.memoryLimit || "");
      setCpuLimit(entry.cpuLimit || "");
      setProgressLogs("");
      setPortStatus({});
      setDeployDone(false);
    }
  }, [entry]);

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  // Debounced port check
  const checkPorts = useCallback(() => {
    if (!serverId) return;
    if (portTimerRef.current) clearTimeout(portTimerRef.current);
    portTimerRef.current = setTimeout(async () => {
      const ports = Object.values(envValues).filter((v) => /^\d+$/.test(v));
      if (ports.length === 0) return;
      try {
        const result = await api.post<Record<string, boolean>>(
          `/workspaces/${workspaceId}/servers/${serverId}/tools/deploy/check-ports`, { ports }
        );
        setPortStatus(result || {});
      } catch { /* silent */ }
    }, 500);
  }, [envValues, serverId]);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const startPolling = (name: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.get<{ logs: string }>(
          `/workspaces/${workspaceId}/servers/${serverId}/tools/deploy/progress?appName=${encodeURIComponent(name)}`
        );
        if (data?.logs != null) setProgressLogs(data.logs);
      } catch { /* silent */ }
    }, 1500);
  };

  async function doDeploy() {
    if (!entry || !appName || !serverId) return;
    setSubmitting(true);
    setProgressLogs("");
    try {
      await api.post(`/workspaces/${workspaceId}/servers/${serverId}/tools/deploy/deploy`, {
        template_id: "custom",
        app_name: appName,
        env: envValues,
        memory_limit: memoryLimit || undefined,
        cpu_limit: cpuLimit || undefined,
        yaml: entry.composeYaml,
      });
      toast.success(`Deployed: ${appName}`);
      setDeployDone(true);
      startPolling(appName);
      onDeployed();
    } catch (e) {
      toast.error("Deploy failed: " + (e instanceof Error ? e.message : ""));
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (!deployDone) stopPolling();
    onOpenChange(false);
  }

  if (!entry) return null;

  const envKeys = Object.keys(entry.defaultEnv || {});

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Configure: {entry.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* App Name */}
          <div>
            <Label>App Name</Label>
            <Input
              value={appName}
              onChange={(e) => setAppName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30))}
              placeholder="my-app"
              disabled={deployDone}
            />
          </div>

          {/* Env Vars */}
          {envKeys.length > 0 && (
            <div>
              <Label className="mb-2 block">Environment Variables</Label>
              <div className="space-y-2">
                {envKeys.map((key) => (
                  <div key={key} className="flex gap-2 items-center">
                    <span className="text-xs font-mono w-28 shrink-0 truncate">{key}</span>
                    <div className="flex-1 flex items-center gap-1">
                      <Input
                        value={envValues[key] || ""}
                        onChange={(e) => { setEnvValues((prev) => ({ ...prev, [key]: e.target.value })); checkPorts(); }}
                        className={cn("h-8 text-xs", portStatus[envValues[key]] && "border-destructive")}
                        disabled={deployDone}
                      />
                      {portStatus[envValues[key]] && (
                        <Badge variant="destructive" className="text-xs shrink-0">Used</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resource limits */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Memory Limit</Label>
              <Input value={memoryLimit} onChange={(e) => setMemoryLimit(e.target.value)} placeholder="512m" className="h-8 text-xs" disabled={deployDone} />
            </div>
            <div>
              <Label>CPU Limit</Label>
              <Input value={cpuLimit} onChange={(e) => setCpuLimit(e.target.value)} placeholder="1.0" className="h-8 text-xs" disabled={deployDone} />
            </div>
          </div>

          {/* Progress logs */}
          {progressLogs && (
            <div>
              <Label className="mb-1 block">Deploy Progress</Label>
              <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-60 overflow-auto">{progressLogs}</pre>
            </div>
          )}
        </div>

        <DialogFooter>
          {deployDone ? (
            <Button variant="outline" onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={doDeploy} disabled={submitting || !appName}>
                {submitting ? "Deploying..." : "Deploy"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
