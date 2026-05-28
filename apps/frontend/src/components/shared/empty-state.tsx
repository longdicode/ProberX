"use client";

import { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

interface Props { icon: LucideIcon; title: string; description: string; action?: { label: string; href?: string; onClick?: () => void }; }

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="rounded-full bg-accent p-4 mb-4"><Icon className="w-8 h-8 text-muted-foreground" /></div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">{description}</p>
      {action && (action.href
        ? <Link href={action.href} className={buttonVariants({ variant: "outline" })}>{action.label}</Link>
        : <button className={buttonVariants({ variant: "outline" })} onClick={action.onClick}>{action.label}</button>
      )}
    </div>
  );
}
