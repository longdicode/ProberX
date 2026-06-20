"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        console.log("[PWA] Service worker registered:", reg.scope);
      } catch (err) {
        console.warn("[PWA] Service worker registration failed:", err);
      }
    };

    register();
  }, []);

  return null;
}
