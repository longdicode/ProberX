"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/stores/locale-store";

const PRESETS = [
  { label: "tasks.presetEveryHour", expr: "0 * * * *" },
  { label: "tasks.presetDailyMidnight", expr: "0 0 * * *" },
  { label: "tasks.presetEvery6Hours", expr: "0 */6 * * *" },
  { label: "tasks.presetWeekly", expr: "0 2 * * 0" },
  { label: "tasks.presetCustom", expr: "" },
] as const;

const MINUTE_OPTIONS = ["*", "0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "*/5", "*/10", "*/15", "*/30"];
const HOUR_OPTIONS = ["*", "*/2", "*/4", "*/6", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23"];
const DOM_OPTIONS = ["*", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31"];
const MONTH_OPTIONS = ["*", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const DOW_OPTIONS = ["*", "0", "1", "2", "3", "4", "5", "6"];

interface Props {
  value: string;
  onChange: (expr: string) => void;
}

export function CronBuilder({ value, onChange }: Props) {
  const { t } = useLocale();
  const [selectedPreset, setSelectedPreset] = useState<string>(() => {
    const match = PRESETS.find((p) => p.expr === value);
    return match?.label ?? "tasks.presetCustom";
  });

  const parts = useMemo(() => {
    const p = value.trim().split(/\s+/);
    return {
      minute: p[0] ?? "*",
      hour: p[1] ?? "*",
      dom: p[2] ?? "*",
      month: p[3] ?? "*",
      dow: p[4] ?? "*",
    };
  }, [value]);

  const isCustom = selectedPreset === "tasks.presetCustom";

  const handlePreset = (presetLabel: string) => {
    setSelectedPreset(presetLabel);
    const preset = PRESETS.find((p) => p.label === presetLabel);
    if (preset && preset.expr) {
      onChange(preset.expr);
    }
    // If "Custom", stay on current value
  };

  const updateField = (field: string, val: string) => {
    const newParts = { ...parts, [field]: val };
    onChange(`${newParts.minute} ${newParts.hour} ${newParts.dom} ${newParts.month} ${newParts.dow}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            variant={selectedPreset === preset.label ? "default" : "outline"}
            size="xs"
            onClick={() => handlePreset(preset.label)}
          >
            {t(preset.label)}
          </Button>
        ))}
      </div>

      {isCustom && (
        <div className="grid grid-cols-5 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("tasks.minute")}</label>
            <Select value={parts.minute} onValueChange={(v) => updateField("minute", v || "*")}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MINUTE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("tasks.hour")}</label>
            <Select value={parts.hour} onValueChange={(v) => updateField("hour", v || "*")}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("tasks.dayOfMonth")}</label>
            <Select value={parts.dom} onValueChange={(v) => updateField("dom", v || "*")}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOM_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("tasks.month")}</label>
            <Select value={parts.month} onValueChange={(v) => updateField("month", v || "*")}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("tasks.dayOfWeek")}</label>
            <Select value={parts.dow} onValueChange={(v) => updateField("dow", v || "*")}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOW_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt === "0" ? "Sun" : opt === "6" ? "Sat" : opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
