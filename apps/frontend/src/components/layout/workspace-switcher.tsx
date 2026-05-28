"use client";

import { useEffect } from "react";
import { ChevronsUpDown, Plus, Building2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useLocale } from "@/stores/locale-store";
import { useWorkspaces } from "@/hooks/use-api";
import { api } from "@/lib/api-client";

export function WorkspaceSwitcher() {
  const { current, list, setCurrent, setList } = useWorkspaceStore();
  const { data: workspaces } = useWorkspaces();
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const ws = await api.post<{ id: string; name: string; plan: string }>("/workspaces", { name: "My Workspace" });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      setCurrent({ id: ws.id, name: ws.name, plan: ws.plan, settings: {} });
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (workspaces && workspaces.length > 0) {
      setList(workspaces);
      if (!current) setCurrent(workspaces[0]);
    }
  }, [workspaces, current, setList, setCurrent]);

  const all = list.length > 0 ? list : (workspaces ?? []);

  return (
    <div className="px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full justify-between px-3 py-2 h-auto text-sm hover:bg-muted rounded-lg flex items-center gap-2 min-w-0">
          <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
          <span className="truncate flex-1 text-left text-sidebar-foreground">{current?.name || t("workspace.selectPlaceholder")}</span>
          <ChevronsUpDown className="w-4 h-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          {all.map((ws) => (
            <DropdownMenuItem key={ws.id} onClick={() => setCurrent(ws)} className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              <span className="flex-1 truncate">{ws.name}</span>
              {ws.id === current?.id && <span className="w-2 h-2 rounded-full bg-success" />}
            </DropdownMenuItem>
          ))}
          {all.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem className="text-primary" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <span className="w-4 h-4 mr-2 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            {creating ? "Creating..." : t("workspace.createWorkspace")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
