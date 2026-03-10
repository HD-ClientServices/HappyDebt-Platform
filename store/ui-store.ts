import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  /** "kanban" | "list" for actionables view */
  actionablesView: "kanban" | "list";
  setActionablesView: (v: "kanban" | "list") => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      actionablesView: "kanban",
      setActionablesView: (v) => set({ actionablesView: v }),
    }),
    { name: "happydebt-ui" }
  )
);
