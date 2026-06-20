"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useLocale } from "@/stores/locale-store";

interface Props {
  cronExpr: string;
  wid: string | undefined;
}

export function CronPreview({ cronExpr, wid }: Props) {
  const { t } = useLocale();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cron-preview", wid, cronExpr],
    queryFn: () =>
      api.post<{ nextRuns: string[]; humanReadable: string }>(
        `/workspaces/${wid}/cronjobs/preview`,
        { cronExpr, count: 5 }
      ),
    enabled: !!wid && cronExpr.length > 0,
    retry: false,
    staleTime: 30_000,
  });

  if (!wid || cronExpr.length === 0) return null;

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">{t("common.loading")}</p>;
  }

  if (isError) {
    return <p className="text-xs text-red-500">{t("tasks.invalidCron")}</p>;
  }

  if (!data) return null;

  return (
    <div className="space-y-1.5 p-3 rounded-lg border border-border/50 bg-muted/30">
      <p className="text-sm font-medium">{data.humanReadable}</p>
      <p className="text-xs text-muted-foreground mb-1">
        {t("tasks.previewCount", { n: 5 })}
      </p>
      <ul className="space-y-0.5">
        {data.nextRuns.map((run, i) => (
          <li key={i} className="text-xs text-muted-foreground font-mono">
            {new Date(run).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}
