"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { registerToastError } from "@/lib/api-client";

/** Registers global toast for automatic API error display */
export function ToastInitializer() {
  useEffect(() => {
    registerToastError((msg: string) => toast.error(msg));
  }, []);

  return null;
}
