import { create } from "zustand";

interface Workspace {
  id: string;
  name: string;
  plan: string;
  settings: Record<string, unknown>;
}

interface WorkspaceState {
  current: Workspace | null;
  list: Workspace[];
  setCurrent: (ws: Workspace) => void;
  setList: (list: Workspace[]) => void;
  clear: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  current: null,
  list: [],
  setCurrent: (ws) => set({ current: ws }),
  setList: (list) => set({ list }),
  clear: () => set({ current: null, list: [] }),
}));
