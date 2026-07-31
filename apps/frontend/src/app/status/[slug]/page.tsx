import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Server, Activity, Cpu, HardDrive, MemoryStick, Clock } from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";

interface ServerMetrics {
  cpuPercent: number | null;
  memTotal: number | null;
  memUsed: number | null;
  diskTotal: number | null;
  diskUsed: number | null;
  netInBytes: number | null;
  netOutBytes: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  updatedAt: string | null;
}

interface ServiceItem {
  name: string;
  type: "server" | "monitor";
  status: "operational" | "degraded" | "down" | "unknown";
  detail: string;
  target?: string;
  monitorType?: string;
  hostInfo?: Record<string, unknown> | null;
  metrics?: ServerMetrics | null;
}

interface StatusTheme {
  primaryColor?: string;
  backgroundColor?: string;
  cardBackground?: string;
  textColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  customCss?: string;
}

interface StatusData {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  theme: StatusTheme;
  status: "operational" | "degraded" | "unknown";
  services: ServiceItem[];
}

const statusConfig = {
  operational: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "All Systems Operational" },
  degraded: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", label: "Degraded Performance" },
  down: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", label: "Down" },
  unknown: { icon: HelpCircle, color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30", label: "Unknown" },
};

async function getStatusData(slug: string): Promise<StatusData | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/status/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(1) + " TB";
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

function GaugeRing({ percent, size = 72, color = "#22c55e" }: { percent: number; size?: number; color?: string }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(Math.max(percent, 0), 100) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-white/5" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <span className="absolute text-sm font-bold">{Math.min(Math.max(percent, 0), 100).toFixed(0)}%</span>
    </div>
  );
}

function LinearBar({ percent, color = "#22c55e", label }: { percent: number; color?: string; label?: string }) {
  const safePercent = Math.min(Math.max(percent, 0), 100);
  return (
    <div className="space-y-1">
      {label && <div className="flex justify-between text-xs text-slate-400"><span>{label}</span><span>{safePercent.toFixed(1)}%</span></div>}
      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${safePercent}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default async function PublicStatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getStatusData(slug);

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0b0d14] gap-4">
        <AlertTriangle className="w-12 h-12 text-slate-500" />
        <h1 className="text-xl font-semibold text-white">Status Page Not Found</h1>
        <p className="text-sm text-slate-400">The status page doesn&apos;t exist or is not published.</p>
      </div>
    );
  }

  const theme = data.theme || ({} as StatusTheme);
  const overall = statusConfig[data.status];
  const servers = data.services.filter((s) => s.type === "server");
  const monitors = data.services.filter((s) => s.type === "monitor");

  return (
    <div className="min-h-screen bg-[#0b0d14] text-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          {(theme.logoUrl || data.logoUrl) && (
            <img src={theme.logoUrl || data.logoUrl || ""} alt={data.name} className="h-10 mx-auto" />
          )}
          <h1 className="text-2xl font-bold text-white">{data.name}</h1>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${overall.bg} ${overall.border} border`}>
            <overall.icon className={`w-5 h-5 ${overall.color}`} />
            <span className={`text-sm font-medium ${overall.color}`}>{overall.label}</span>
          </div>
        </div>

        {/* Server Cards */}
        {servers.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-400" /> Servers
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {servers.map((s, i) => {
                const m = s.metrics;
                const hi = s.hostInfo as Record<string, unknown> | null;
                const cpuColor = m?.cpuPercent != null ? (m.cpuPercent > 80 ? "#ef4444" : m.cpuPercent > 60 ? "#f59e0b" : "#22c55e") : "#64748b";
                const memPct = m?.memUsed && m?.memTotal ? (m.memUsed / m.memTotal) * 100 : 0;
                const memColor = memPct > 80 ? "#ef4444" : memPct > 60 ? "#f59e0b" : "#22c55e";
                const diskPct = m?.diskUsed && m?.diskTotal ? (m.diskUsed / m.diskTotal) * 100 : 0;
                const diskColor = diskPct > 80 ? "#ef4444" : diskPct > 60 ? "#f59e0b" : "#22c55e";

                return (
                  <Card key={i} className="border-0 bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.05] transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base text-white">{s.name}</CardTitle>
                        <Badge variant="outline" className={s.status === "operational" ? "border-emerald-500/30 text-emerald-400 text-[10px]" : "border-red-500/30 text-red-400 text-[10px]"}>
                          {s.status === "operational" ? "Online" : "Offline"}
                        </Badge>
                      </div>
                      {hi && <p className="text-xs text-slate-500 mt-0.5">{String(hi.os || "")} · {String(hi.hostname || "")}</p>}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {m ? (
                        <>
                          <div className="flex justify-center gap-6">
                            <div className="flex flex-col items-center gap-1">
                              <GaugeRing percent={m.cpuPercent ?? 0} color={cpuColor} size={72} />
                              <span className="text-[10px] text-slate-500 flex items-center gap-1"><Cpu className="w-3 h-3" /> CPU</span>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <GaugeRing percent={memPct} color={memColor} size={72} />
                              <span className="text-[10px] text-slate-500 flex items-center gap-1"><MemoryStick className="w-3 h-3" /> RAM</span>
                            </div>
                          </div>
                          <LinearBar percent={memPct} color={memColor} label={`Memory ${formatBytes(m.memUsed)} / ${formatBytes(m.memTotal)}`} />
                          <LinearBar percent={diskPct} color={diskColor} label={`Disk ${formatBytes(m.diskUsed)} / ${formatBytes(m.diskTotal)}`} />
                          {m.load1 != null && (
                            <div className="flex gap-4 text-xs text-slate-400 pt-1 border-t border-white/5">
                              <span>Load: {m.load1.toFixed(1)} / {(m.load5 ?? 0).toFixed(1)} / {(m.load15 ?? 0).toFixed(1)}</span>
                              {m.updatedAt && <span className="ml-auto text-slate-600">updated {new Date(m.updatedAt).toLocaleTimeString()}</span>}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="py-6 text-center text-sm text-slate-600">
                          <Activity className="w-6 h-6 mx-auto mb-2 opacity-50" />
                          Waiting for metrics...
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Monitor Cards */}
        {monitors.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" /> Monitors
            </h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {monitors.map((m, i) => {
                const sc = statusConfig[m.status];
                return (
                  <Card key={i} className="border-0 bg-white/[0.03] backdrop-blur-sm">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{m.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {m.monitorType && <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">{m.monitorType.toUpperCase()}</Badge>}
                            {m.target && <span className="text-xs text-slate-500 truncate">{m.target}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className="text-xs text-slate-400">{m.detail}</span>
                          <sc.icon className={`w-4 h-4 ${sc.color}`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {data.services.length === 0 && (
          <Card className="border-0 bg-white/[0.03]">
            <CardContent className="py-12 text-center text-sm text-slate-500">
              No services configured yet.
            </CardContent>
          </Card>
        )}

        <div className="text-center text-xs text-slate-600 pt-8">
          Powered by ProberX
        </div>
      </div>
    </div>
  );
}
