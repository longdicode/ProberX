"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Server, Plus, Trash2, ArrowLeft, Search, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ServerStatusBadge } from "@/components/servers/server-status-badge";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaces, useServers } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

interface FirewallRule {
  num: string;
  pkts: string;
  bytes: string;
  target: string;
  prot: string;
  opt: string;
  in: string;
  out: string;
  source: string;
  destination: string;
  extra?: string;
}

interface ChainInfo {
  chain: string;
  policy: string;
  rules: FirewallRule[];
}

export default function FirewallPage() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { current, setCurrent } = useWorkspaceStore();
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces();
  const { data: servers, isLoading: serversLoading } = useServers(current?.id);

  const serverId = searchParams.get("serverId");
  const selectedServer = servers?.find((s) => s.id === serverId);

  const [chains, setChains] = useState<ChainInfo[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [activeChain, setActiveChain] = useState("INPUT");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ chain: string; num: string; desc: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addForm, setAddForm] = useState({
    chain: "INPUT", protocol: "", src_ip: "", dst_ip: "",
    src_port: "", dst_port: "", target: "ACCEPT", extra: "",
  });

  useEffect(() => {
    if (!current && workspaces && workspaces.length > 0) setCurrent(workspaces[0]);
  }, [workspaces, current, setCurrent]);

  const fetchRules = useCallback(async () => {
    if (!current?.id || !serverId) return;
    setRulesLoading(true);
    setRulesError("");
    try {
      const data = await api.get<{ chains: ChainInfo[] }>(
        `/workspaces/${current.id}/servers/${serverId}/firewall/rules`
      );
      setChains(data.chains || []);
      if (data.chains?.length && !data.chains.find((c) => c.chain === activeChain)) {
        setActiveChain(data.chains[0].chain);
      }
    } catch (err) {
      setRulesError(err instanceof Error ? err.message : "Failed to load firewall rules");
    } finally {
      setRulesLoading(false);
    }
  }, [current?.id, serverId, activeChain]);

  useEffect(() => {
    if (serverId) fetchRules();
  }, [serverId]);

  function selectServer(sid: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("serverId", sid);
    router.push(`/firewall?${params.toString()}`);
  }

  function goBack() {
    router.push("/firewall");
  }

  async function handleAddRule() {
    if (!current?.id || !serverId) return;
    setAdding(true);
    try {
      await api.post(`/workspaces/${current.id}/servers/${serverId}/firewall/rules`, addForm);
      toast.success(t("firewall.ruleAdded"));
      setAddOpen(false);
      setAddForm({ chain: activeChain, protocol: "", src_ip: "", dst_ip: "", src_port: "", dst_port: "", target: "ACCEPT", extra: "" });
      fetchRules();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add rule");
    } finally { setAdding(false); }
  }

  async function handleDeleteRule() {
    if (!current?.id || !serverId || !deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"}/workspaces/${current.id}/servers/${serverId}/firewall/rules`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("proberx_token")}` },
        body: JSON.stringify({ chain: deleteTarget.chain, num: deleteTarget.num }),
      });
      toast.success(t("firewall.ruleDeleted"));
      fetchRules();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete rule");
    } finally { setDeleting(false); setDeleteTarget(null); }
  }

  // Server selection state
  if (!serverId) {
    if (wsLoading || serversLoading) return <PageSkeleton />;
    const onlineServers = servers?.filter((s) => s.isOnline && s.hostInfo) ?? [];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("nav.firewall")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("firewall.selectServerDesc")}</p>
        </div>
        {onlineServers.length === 0 ? (
          <EmptyState icon={Shield} title={t("firewall.selectServer")}
            description={t("firewall.selectServerDesc")} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {onlineServers.map((s) => (
              <Card key={s.id}
                className="border-border/50 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => selectServer(s.id)}
              >
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      {s.name}
                      <ServerStatusBadge status="online" />
                    </CardTitle>
                    {s.tags?.length ? (
                      <div className="flex gap-1 mt-1">{s.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}</div>
                    ) : null}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">
                    {s.hostInfo ? `${(s.hostInfo as Record<string, unknown>).os || ""} / ${(s.hostInfo as Record<string, unknown>).arch || ""}` : ""}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Rules management state
  const currentChain = chains.find((c) => c.chain === activeChain);
  const filteredRules = currentChain?.rules?.filter((r) =>
    !search || r.target.toLowerCase().includes(search.toLowerCase()) ||
    r.prot.toLowerCase().includes(search.toLowerCase()) ||
    r.source.toLowerCase().includes(search.toLowerCase()) ||
    r.destination.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("firewall.rulesFor")} {selectedServer?.name}
          </h1>
        </div>
      </div>

      {rulesLoading ? (
        <PageSkeleton />
      ) : rulesError ? (
        <EmptyState icon={Shield} title="Error" description={rulesError} />
      ) : chains.length === 0 && !rulesLoading ? (
        <EmptyState icon={Shield} title={t("nav.firewall")}
          description={selectedServer?.isOnline ? t("firewall.notSupported") : t("firewall.noAgent")} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Tabs value={activeChain} onValueChange={setActiveChain}>
              <TabsList>
                {chains.map((c) => (
                  <TabsTrigger key={c.chain} value={c.chain}>
                    {c.chain}
                    <Badge variant="secondary" className="ml-2 text-xs">{c.rules.length}</Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <div className="relative w-48">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
              </div>
              <Button size="sm" onClick={() => { setAddForm({ ...addForm, chain: activeChain }); setAddOpen(true); }}>
                <Plus className="w-4 h-4 mr-1.5" /> {t("firewall.addRule")}
              </Button>
            </div>
          </div>

          {currentChain && (
            <p className="text-xs text-muted-foreground">{t("firewall.policy")}: {currentChain.policy}</p>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.num")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.pkts")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.bytes")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.target")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.protocol")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.in")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.out")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.source")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.destination")}</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">{t("firewall.extra")}</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center p-8 text-muted-foreground">{t("firewall.noRules")}</td>
                      </tr>
                    ) : (
                      filteredRules.map((r) => (
                        <tr key={`${r.num}-${r.target}-${r.source}`} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-mono text-xs">{r.num}</td>
                          <td className="p-3 font-mono text-xs">{r.pkts}</td>
                          <td className="p-3 font-mono text-xs">{r.bytes}</td>
                          <td className="p-3">
                            <Badge variant={r.target === "ACCEPT" ? "default" : r.target === "DROP" ? "destructive" : "secondary"} className="text-xs">
                              {r.target}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono text-xs">{r.prot}</td>
                          <td className="p-3 font-mono text-xs">{r.in}</td>
                          <td className="p-3 font-mono text-xs">{r.out}</td>
                          <td className="p-3 font-mono text-xs">{r.source}</td>
                          <td className="p-3 font-mono text-xs">{r.destination}</td>
                          <td className="p-3 font-mono text-xs max-w-[200px] truncate">{r.extra || "--"}</td>
                          <td className="p-3 text-right">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteTarget({ chain: activeChain, num: r.num, desc: `${r.target} ${r.source} → ${r.destination}` })}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) setAddOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("firewall.addRule")}</DialogTitle>
            <DialogDescription>Add a new iptables rule</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("firewall.chain")}</Label>
                <Select value={addForm.chain} onValueChange={(v) => setAddForm({ ...addForm, chain: v || "INPUT" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {chains.map((c) => <SelectItem key={c.chain} value={c.chain}>{c.chain}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("firewall.target")}</Label>
                <Select value={addForm.target} onValueChange={(v) => setAddForm({ ...addForm, target: v || "ACCEPT" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCEPT">ACCEPT</SelectItem>
                    <SelectItem value="DROP">DROP</SelectItem>
                    <SelectItem value="REJECT">REJECT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("firewall.protocol")}</Label>
                <Select value={addForm.protocol} onValueChange={(v) => setAddForm({ ...addForm, protocol: v || "" })}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any</SelectItem>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                    <SelectItem value="icmp">ICMP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("firewall.destination")} Port</Label>
                <Input placeholder="e.g. 80, 443" value={addForm.dst_port}
                  onChange={(e) => setAddForm({ ...addForm, dst_port: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("firewall.source")} IP</Label>
                <Input placeholder="e.g. 192.168.1.0/24" value={addForm.src_ip}
                  onChange={(e) => setAddForm({ ...addForm, src_ip: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("firewall.destination")} IP</Label>
                <Input placeholder="Any" value={addForm.dst_ip}
                  onChange={(e) => setAddForm({ ...addForm, dst_ip: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleAddRule} disabled={adding}>{adding ? "Adding..." : t("firewall.addRule")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`${t("firewall.deleteRule")}: ${deleteTarget?.chain} #${deleteTarget?.num}`}
        description={t("firewall.deleteConfirm")}
        confirmLabel={t("firewall.deleteRule")}
        onConfirm={handleDeleteRule}
        variant="destructive"
      />
    </div>
  );
}
