"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Props { status: "online" | "offline" | "warning"; className?: string; }

export function ServerStatusBadge({ status, className }: Props) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <span className={cn("w-2 h-2 rounded-full",
        status === "online" && "bg-success animate-probe-pulse",
        status === "offline" && "bg-muted-foreground",
        status === "warning" && "bg-warning"
      )} />
      <span className="capitalize">{status}</span>
    </Badge>
  );
}
