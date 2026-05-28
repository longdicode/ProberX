"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useLocale } from "@/stores/locale-store";

interface Props { data: { time: string; [key: string]: number | string }[]; dataKey: string; color: string; }

export function MetricChart({ data, dataKey, color }: Props) {
  const { t } = useLocale();
  if (data.length === 0) return <p className="text-muted-foreground">{t("metrics.waitingForData")}</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} animationDuration={300} />
      </LineChart>
    </ResponsiveContainer>
  );
}
