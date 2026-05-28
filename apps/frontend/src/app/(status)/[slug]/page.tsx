import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, Server, Activity } from "lucide-react";
import { API_BASE_URL } from "@/lib/constants";

interface ServiceItem {
  name: string;
  type: "server" | "monitor";
  status: "operational" | "degraded" | "down" | "unknown";
  detail: string;
  target?: string;
  monitorType?: string;
}

interface StatusData {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  theme: Record<string, unknown>;
  status: "operational" | "degraded" | "unknown";
  services: ServiceItem[];
}

const statusConfig = {
  operational: { icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30", label: "Operational" },
  degraded: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "Degraded" },
  down: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", label: "Down" },
  unknown: { icon: HelpCircle, color: "text-muted-foreground", bg: "bg-accent", border: "border-border", label: "Unknown" },
};

async function getStatusData(slug: string): Promise<StatusData | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/status/${slug}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function PublicStatusPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getStatusData(slug);

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <AlertTriangle className="w-12 h-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Status Page Not Found</h1>
        <p className="text-sm text-muted-foreground">The status page you&apos;re looking for doesn&apos;t exist or is not published.</p>
      </div>
    );
  }

  const overall = statusConfig[data.status];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-8">
        <div className="text-center space-y-4">
          {data.logoUrl && <img src={data.logoUrl} alt={data.name} className="h-12 mx-auto" />}
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${overall.bg} ${overall.border} border`}>
            <overall.icon className={`w-5 h-5 ${overall.color}`} />
            <span className={`text-sm font-medium ${overall.color}`}>
              {data.status === "operational" ? "All Systems Operational" : data.status === "degraded" ? "Some Systems Degraded" : "Status Unknown"}
            </span>
          </div>
        </div>

        {data.services.length > 0 && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {data.services.map((svc, i) => {
                const s = statusConfig[svc.status];
                return (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {svc.type === "server"
                        ? <Server className="w-4 h-4 text-muted-foreground shrink-0" />
                        : <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{svc.name}</span>
                        {svc.monitorType && (
                          <Badge variant="outline" className="ml-2 text-xs">{svc.monitorType.toUpperCase()}</Badge>
                        )}
                        {svc.target && <p className="text-xs text-muted-foreground truncate">{svc.target}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <span className="text-xs text-muted-foreground">{svc.detail}</span>
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {data.services.length === 0 && (
          <Card className="border-border/50">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No services configured yet.
            </CardContent>
          </Card>
        )}

        <div className="text-center text-xs text-muted-foreground">
          Powered by ProberX
        </div>
      </div>
    </div>
  );
}
