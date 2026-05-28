import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCallback } from "react";
import en from "@/lib/locales/en";
import zh from "@/lib/locales/zh";

export type Locale = "en" | "zh";

const dictionaries = { en, zh } as const;

export function detectBrowserLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith("zh")) return "zh";
    return "en";
  } catch {
    return "en";
  }
}

export function resolveLocale(stored: unknown): Locale {
  if (stored === "en" || stored === "zh") return stored;
  return detectBrowserLocale();
}

export function lookup(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : path;
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "en" as Locale,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "proberx_locale",
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            state.locale = resolveLocale(state.locale);
          }
        };
      },
    }
  )
);

export function useLocale() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[locale] as unknown as Record<string, unknown>;
      const raw = lookup(dict, path);
      return interpolate(raw, vars);
    },
    [locale]
  );

  return { t, locale, setLocale };
}
