"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useLocaleStore } from "@/stores/locale-store";

const publicPaths = ["/", "/login", "/register", "/status"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();
  const locale = useLocaleStore((s) => s.locale);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { initialize(); }, []);
  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !publicPaths.some((p) => pathname.startsWith(p))) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm text-muted-foreground">ProberX</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
