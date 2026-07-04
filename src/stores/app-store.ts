import { create } from "zustand";
import type { PageId, Theme } from "@/types/app";

interface AppState {
  /** 当前激活页面 */
  currentPage: PageId;
  /** Chat Sidebar 是否展开 */
  chatSidebarOpen: boolean;
  /** 主题（深色为默认） */
  theme: Theme;
  /** 全局快速输入框是否打开 */
  quickInputOpen: boolean;
  /** 全局命令面板是否打开 */
  commandPaletteOpen: boolean;

  setPage: (page: PageId) => void;
  toggleChatSidebar: () => void;
  setChatSidebarOpen: (open: boolean) => void;
  toggleTheme: () => void;
  setQuickInputOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: "dashboard",
  chatSidebarOpen: true,
  theme: "dark",
  quickInputOpen: false,
  commandPaletteOpen: false,

  setPage: (page) => set({ currentPage: page }),
  toggleChatSidebar: () =>
    set((state) => ({ chatSidebarOpen: !state.chatSidebarOpen })),
  setChatSidebarOpen: (open) => set({ chatSidebarOpen: open }),
  toggleTheme: () =>
    set((state) => ({
      theme: state.theme === "dark" ? "light" : "dark",
    })),
  setQuickInputOpen: (open) => set({ quickInputOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
