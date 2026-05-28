"use client";

import { useLocale, type Locale } from "@/stores/locale-store";

const labels: Record<Locale, string> = { en: "EN", zh: "中" };
const next: Record<Locale, Locale> = { en: "zh", zh: "en" };

export function LocaleSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <button
      onClick={() => setLocale(next[locale])}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      aria-label={`Switch to ${next[locale] === "zh" ? "Chinese" : "English"}`}
    >
      {labels[locale]}
    </button>
  );
}
