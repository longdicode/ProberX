"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/loading-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { Globe, Trash2, Edit, Plus, ChevronRight, Settings2 } from "lucide-react";
import { ToolHeader, ErrorMsg } from "./shared";

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "SOA"];

export default function DnsTool({ t, endpoint, meta, router, serverId, servers }: {
  t: any;
  endpoint: (path: string) => string;
  meta: any;
  router: any;
  serverId: string;
  servers: any[];
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<any>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({ provider: "", api_key: "", api_secret: "" });
  const [configSubmitting, setConfigSubmitting] = useState(false);
  const [configConfigured, setConfigConfigured] = useState(false);

  // Record dialog
  const [recordOpen, setRecordOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [recordForm, setRecordForm] = useState({ name: "", type: "A", content: "", ttl: 600, priority: 0 });
  const [recordSubmitting, setRecordSubmitting] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const [cfg, provs] = await Promise.all([
        api.get<any>(endpoint("/tools/dns/config")).catch(() => null),
        api.get<string[]>(endpoint("/tools/dns/providers")).catch(() => []),
      ]);
      setConfig(cfg);
      setProviders(provs);
      setConfigConfigured(!!cfg?.provider);
    } catch { /* ignore */ }
  }, [endpoint]);

  const fetchZones = useCallback(async () => {
    setZonesLoading(true);
    try {
      const data = await api.get<any[]>(endpoint("/tools/dns/zones"));
      setZones(data || []);
      if (data?.length > 0 && !selectedZoneId) {
        setSelectedZoneId(data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load zones");
    } finally {
      setZonesLoading(false);
    }
  }, [endpoint, selectedZoneId]);

  const fetchRecords = useCallback(async (zoneId: string) => {
    if (!zoneId) return;
    setRecordsLoading(true);
    try {
      const data = await api.get<any[]>(endpoint(`/tools/dns/records?zoneId=${encodeURIComponent(zoneId)}`));
      setRecords(data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load records");
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfig()]).finally(() => setLoading(false));
  }, [fetchConfig]);

  useEffect(() => {
    if (configConfigured) {
      fetchZones();
    }
  }, [configConfigured, fetchZones]);

  useEffect(() => {
    if (selectedZoneId && configConfigured) {
      fetchRecords(selectedZoneId);
    }
  }, [selectedZoneId, configConfigured, fetchRecords]);

  useEffect(() => {
    if (!selectedZoneId && zones.length > 0) {
      setSelectedZoneId(zones[0].id);
    }
  }, [zones, selectedZoneId]);

  async function saveConfig() {
    if (!configForm.provider || !configForm.api_key) return;
    setConfigSubmitting(true);
    try {
      await api.post(endpoint("/tools/dns/config"), configForm);
      toast.success(t("tools.dnsConfigSaved"));
      setConfigOpen(false);
      await fetchConfig();
      setConfigConfigured(true);
      fetchZones();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setConfigSubmitting(false);
    }
  }

  async function openCreateRecord() {
    setEditingRecord(null);
    setRecordForm({ name: "", type: "A", content: "", ttl: 600, priority: 0 });
    setRecordOpen(true);
  }

  async function openEditRecord(record: any) {
    setEditingRecord(record);
    setRecordForm({
      name: record.name,
      type: record.type,
      content: record.content,
      ttl: record.ttl || 600,
      priority: record.priority || 0,
    });
    setRecordOpen(true);
  }

  async function submitRecord() {
    if (!recordForm.name || !recordForm.content) return;
    if (!selectedZoneId) return;
    setRecordSubmitting(true);
    try {
      const body = {
        zone_id: selectedZoneId,
        name: recordForm.name,
        type: recordForm.type,
        content: recordForm.content,
        ttl: recordForm.ttl,
        priority: recordForm.type === "MX" ? (recordForm.priority || 10) : 0,
      };

      if (editingRecord) {
        await api.put(endpoint(`/tools/dns/records/${encodeURIComponent(editingRecord.id)}`), body);
        toast.success(t("tools.dnsRecordUpdated"));
      } else {
        await api.post(endpoint("/tools/dns/records"), body);
        toast.success(t("tools.dnsRecordCreated"));
      }
      setRecordOpen(false);
      setEditingRecord(null);
      await fetchRecords(selectedZoneId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setRecordSubmitting(false);
    }
  }

  async function deleteRecord() {
    if (!deleteTarget || !selectedZoneId) return;
    setDeleting(true);
    try {
      await api.delete(endpoint(`/tools/dns/records/${encodeURIComponent(deleteTarget.id)}`), {
        zone_id: selectedZoneId,
      });
      toast.success(t("tools.dnsRecordDeleted"));
      setDeleteTarget(null);
      await fetchRecords(selectedZoneId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeleting(false);
    }
  }

  const selectedZoneName = zones.find(z => z.id === selectedZoneId)?.name || selectedZoneId;

  if (loading) return <div className="space-y-6"><ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} /><PageSkeleton /></div>;

  return (
    <div className="space-y-6">
      <ToolHeader meta={meta} router={router} t={t} serverId={serverId} servers={servers} />

      {error ? <ErrorMsg msg={error} /> : (
        <div className="space-y-4 max-w-4xl">
          {/* Config Section */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                {t("tools.dnsConfig")}
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => {
                setConfigForm({
                  provider: config?.provider || "",
                  api_key: config?.api_key || "",
                  api_secret: "",
                });
                setConfigOpen(true);
              }}>
                {configConfigured ? t("common.edit") : t("tools.dnsConfigure")}
              </Button>
            </CardHeader>
            <CardContent className="py-2">
              {configConfigured ? (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">{config?.provider}</Badge>
                  <span>{t("tools.dnsConfigured")}</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("tools.dnsNotConfigured")}</p>
              )}
            </CardContent>
          </Card>

          {/* Zones */}
          {configConfigured && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm">{t("tools.dnsZones")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {zonesLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-6">{t("common.loading")}</p>
                ) : zones.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">{t("tools.dnsNoZones")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 text-xs">{t("tools.dnsZoneName")}</th>
                        <th className="text-left p-3 text-xs">{t("tools.dnsZoneStatus")}</th>
                        <th className="text-right p-3 text-xs">{t("tools.dnsRecords")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.map((z: any) => (
                        <tr
                          key={z.id}
                          className={`border-b hover:bg-muted/30 cursor-pointer ${selectedZoneId === z.id ? "bg-muted/50" : ""}`}
                          onClick={() => setSelectedZoneId(z.id)}
                        >
                          <td className="p-3 font-mono text-xs">{z.name}</td>
                          <td className="p-3">
                            <Badge variant={z.status === "active" ? "default" : "secondary"} className="text-xs">
                              {z.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-muted-foreground">{z.record_count || "-"}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}

          {/* Records */}
          {configConfigured && selectedZoneId && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-sm">{t("tools.dnsRecords")}: {selectedZoneName}</CardTitle>
                <Button size="sm" onClick={openCreateRecord}>
                  <Plus className="w-3.5 h-3.5 mr-1" />{t("tools.dnsCreateRecord")}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {recordsLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-6">{t("common.loading")}</p>
                ) : records.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">{t("tools.dnsNoRecords")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 text-xs">{t("tools.dnsRecordName")}</th>
                        <th className="text-left p-3 text-xs w-16">{t("tools.dnsRecordType")}</th>
                        <th className="text-left p-3 text-xs">{t("tools.dnsRecordContent")}</th>
                        <th className="text-center p-3 text-xs w-16">{t("tools.dnsRecordTTL")}</th>
                        <th className="text-right p-3 text-xs w-24">{t("tools.serviceControl")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r: any) => (
                        <tr key={r.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs">{r.name}</td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-xs font-mono">{r.type}</Badge>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground truncate max-w-xs">{r.content}</td>
                          <td className="p-3 text-center text-xs text-muted-foreground">{r.ttl || "Auto"}</td>
                          <td className="p-3 text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditRecord(r)}>
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteTarget({ id: r.id, name: r.name })}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Config Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("tools.dnsConfig")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.dnsProvider")}</label>
              <Select value={configForm.provider ?? ""} onValueChange={(v) => setConfigForm({ ...configForm, provider: v || "" })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("tools.dnsSelectProvider")} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.dnsApiKey")}</label>
              <Input
                value={configForm.api_key}
                onChange={(e) => setConfigForm({ ...configForm, api_key: e.target.value })}
                placeholder={t("tools.dnsApiKeyPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.dnsApiSecret")}</label>
              <Input
                value={configForm.api_secret}
                onChange={(e) => setConfigForm({ ...configForm, api_secret: e.target.value })}
                placeholder={t("tools.dnsApiSecretPlaceholder")}
                type="password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveConfig} disabled={configSubmitting || !configForm.provider || !configForm.api_key}>
              {configSubmitting ? "..." : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Record Dialog */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRecord ? t("tools.dnsEditRecord") : t("tools.dnsCreateRecord")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.dnsRecordName")}</label>
              <Input
                value={recordForm.name}
                onChange={(e) => setRecordForm({ ...recordForm, name: e.target.value })}
                placeholder="@"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.dnsRecordType")}</label>
              <Select value={recordForm.type ?? ""} onValueChange={(v) => setRecordForm({ ...recordForm, type: v || "" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_TYPES.map((rt) => (
                    <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.dnsRecordContent")}</label>
              <Input
                value={recordForm.content}
                onChange={(e) => setRecordForm({ ...recordForm, content: e.target.value })}
                placeholder="192.168.1.1"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">{t("tools.dnsRecordTTL")}</label>
              <Input
                type="number"
                value={recordForm.ttl}
                onChange={(e) => setRecordForm({ ...recordForm, ttl: parseInt(e.target.value) || 600 })}
              />
            </div>
            {recordForm.type === "MX" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{t("tools.dnsRecordPriority")}</label>
                <Input
                  type="number"
                  value={recordForm.priority}
                  onChange={(e) => setRecordForm({ ...recordForm, priority: parseInt(e.target.value) || 10 })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={submitRecord} disabled={recordSubmitting || !recordForm.name || !recordForm.content}>
              {recordSubmitting ? "..." : (editingRecord ? t("tools.dnsUpdateRecord") : t("tools.dnsCreateRecord"))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Record Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`${t("tools.dnsDeleteRecord")}: ${deleteTarget?.name || ""}`}
        description={t("tools.dnsDeleteRecordDesc", { name: deleteTarget?.name || "" })}
        confirmLabel={deleting ? "..." : t("tools.dnsDeleteRecord")}
        onConfirm={deleteRecord}
        variant="destructive"
      />
    </div>
  );
}
