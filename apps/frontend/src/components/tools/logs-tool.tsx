"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ToolHeader, ErrorMsg } from "./shared";

export default function LogsTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [unit, setUnit] = useState("");
  const [lines, setLines] = useState("100");
  const [since, setSince] = useState("");
  const [filePath, setFilePath] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"journal" | "file">("journal");

  async function fetchLogs() {
    setLoading(true); setError("");
    try {
      let data: any[];
      if (mode === "journal") {
        const qs = new URLSearchParams();
        if (unit) qs.set("unit", unit);
        qs.set("lines", lines);
        if (since) qs.set("since", since);
        data = await api.get<any[]>(endpoint(`/tools/logs?${qs}`));
      } else {
        const qs = new URLSearchParams();
        qs.set("path", filePath);
        qs.set("lines", lines);
        data = await api.get<any[]>(endpoint(`/tools/logs/file?${qs}`));
      }
      setEntries(data || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />
      <div className="flex gap-3 flex-wrap items-end max-w-2xl">
        <Button variant={mode === "journal" ? "default" : "outline"} size="sm" onClick={() => setMode("journal")}>journalctl</Button>
        <Button variant={mode === "file" ? "default" : "outline"} size="sm" onClick={() => setMode("file")}>File</Button>
        {mode === "journal" ? (
          <Input placeholder={t("tools.logUnit")} value={unit} onChange={(e) => setUnit(e.target.value)} className="w-48" />
        ) : (
          <Input placeholder={t("tools.logFile")} value={filePath} onChange={(e) => setFilePath(e.target.value)} className="w-64" />
        )}
        {mode === "journal" && <Input placeholder={t("tools.logSince")} value={since} onChange={(e) => setSince(e.target.value)} className="w-40" />}
        <Input type="number" value={lines} onChange={(e) => setLines(e.target.value)} className="w-20" />
        <Button onClick={fetchLogs} disabled={loading}>{loading ? "..." : t("tools.fetchLogs")}</Button>
      </div>
      {error && <ErrorMsg msg={error} />}
      {entries.length > 0 && (
        <Card>
          <CardContent className="p-2 max-h-[600px] overflow-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {entries.map((e, i) => (
                <div key={i} className={cn("py-0.5", e.priority === "err" && "text-red-500")}>
                  {e.timestamp && <span className="text-muted-foreground mr-2">{e.timestamp}</span>}
                  {e.unit && <span className="text-primary mr-2">{e.unit}</span>}
                  {e.message}
                </div>
              ))}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
