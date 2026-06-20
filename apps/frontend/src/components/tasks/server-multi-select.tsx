"use client";

import { useLocale } from "@/stores/locale-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Server } from "@/hooks/use-api";

interface Props {
  servers: Server[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}

export function ServerMultiSelect({ servers, value, onChange, placeholder }: Props) {
  const { t } = useLocale();

  const toggle = (serverId: string) => {
    if (value.includes(serverId)) {
      onChange(value.filter((id) => id !== serverId));
    } else {
      onChange([...value, serverId]);
    }
  };

  const selectedNames = value
    .map((id) => servers.find((s) => s.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline" className="w-full justify-start text-left font-normal">
          <span className={cn("truncate", !value.length && "text-muted-foreground")}>
            {value.length > 0
              ? `${value.length} server${value.length > 1 ? "s" : ""} selected`
              : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-2" align="start">
        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {servers.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">{t("tasks.noServersSelected")}</p>
          ) : (
            servers.map((srv) => {
              const isSelected = value.includes(srv.id);
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => toggle(srv.id)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm text-left hover:bg-accent transition-colors"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      isSelected ? "bg-primary border-primary" : "border-input"
                    )}
                  >
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate flex-1">{srv.name}</span>
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      srv.isOnline ? "bg-green-400" : "bg-muted-foreground/30"
                    )}
                  />
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
