"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

const PROVIDER_ENDPOINTS: Record<string, string> = {
  s3: "https://s3.amazonaws.com",
  oss: "https://oss-cn-hangzhou.aliyuncs.com",
  r2: "https://<account_id>.r2.cloudflarestorage.com",
  minio: "http://localhost:9000",
};

const PROVIDER_REGIONS: Record<string, string> = {
  s3: "us-east-1",
  oss: "cn-hangzhou",
  r2: "auto",
  minio: "us-east-1",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  endpoint: (path: string) => string;
  t: any;
}

export default function CloudBackupConfigDialog({ open, onOpenChange, endpoint, t }: Props) {
  const [provider, setProvider] = useState("s3");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [region, setRegion] = useState("");
  const [bucket, setBucket] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [autoUpload, setAutoUpload] = useState(false);
  const [retentionDays, setRetentionDays] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get<{
      provider?: string;
      endpoint?: string;
      region?: string;
      bucket?: string;
      access_key?: string;
      secret_key?: string;
      auto_upload?: boolean;
      retention_days?: number;
    }>(endpoint("/tools/backups/cloud-config"), { noToast: true })
      .then((cfg) => {
        if (cfg?.provider) setProvider(cfg.provider);
        if (cfg?.endpoint) setEndpointUrl(cfg.endpoint);
        if (cfg?.region) setRegion(cfg.region);
        if (cfg?.bucket) setBucket(cfg.bucket);
        if (cfg?.access_key) setAccessKey(cfg.access_key);
        if (cfg?.auto_upload !== undefined) setAutoUpload(cfg.auto_upload);
        if (cfg?.retention_days !== undefined) setRetentionDays(cfg.retention_days);
        // secret_key comes masked — don't populate
      })
      .catch(() => { /* no config yet */ });
  }, [open, endpoint]);

  function handleProviderChange(value: string) {
    setProvider(value);
    setEndpointUrl(PROVIDER_ENDPOINTS[value] || "");
    setRegion(PROVIDER_REGIONS[value] || "");
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(endpoint("/tools/backups/cloud-config"), {
        provider,
        endpoint: endpointUrl,
        region,
        bucket,
        access_key: accessKey,
        secret_key: secretKey,
        auto_upload: autoUpload,
        retention_days: retentionDays,
      });
      toast.success(t("tools.cloudConfigSaved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    try {
      await api.post(endpoint("/tools/backups/cloud/test"));
      toast.success(t("tools.cloudTestConnSuccess"));
    } catch (e) {
      toast.error(t("tools.cloudTestConnFailed") + ": " + (e instanceof Error ? e.message : ""));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tools.configureCloud")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t("tools.cloudProvider")}</label>
            <Select value={provider} onValueChange={(v) => handleProviderChange(v || "s3")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="s3">{t("tools.cloudProviderS3")}</SelectItem>
                <SelectItem value="oss">{t("tools.cloudProviderOSS")}</SelectItem>
                <SelectItem value="r2">{t("tools.cloudProviderR2")}</SelectItem>
                <SelectItem value="minio">{t("tools.cloudProviderMinIO")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">{t("tools.cloudEndpoint")}</label>
            <Input
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder={PROVIDER_ENDPOINTS[provider]}
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("tools.cloudRegion")}</label>
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={PROVIDER_REGIONS[provider]}
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("tools.cloudBucket")}</label>
            <Input
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="my-backups"
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("tools.cloudAccessKey")}</label>
            <Input
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="AKIAIOSFODNN7EXAMPLE"
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("tools.cloudSecretKey")}</label>
            <Input
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={t("tools.cloudSecretKey")}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <label className="text-sm font-medium">{t("tools.cloudAutoUpload")}</label>
              <p className="text-xs text-muted-foreground">{t("tools.cloudAutoUploadDesc")}</p>
            </div>
            <Switch checked={autoUpload} onCheckedChange={setAutoUpload} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("tools.cloudRetentionDays")}</label>
            <p className="text-xs text-muted-foreground mb-1">{t("tools.cloudRetentionDaysDesc")}</p>
            <Input
              type="number"
              min={0}
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleTestConnection} disabled={testing}>
              {testing ? t("common.loading") : t("tools.cloudTestConn")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
