import { useEffect } from "react";
import { useAppStore } from "@/stores/app-store";

/**
 * 全局快捷键骨架
 * 详见 docs/UI_UX_SPEC.md §9
 *
 * - Cmd/Ctrl+K  命令面板（Phase 9 完整实现，Phase 1 仅 toggle）
 * - Cmd/Ctrl+I  快速输入（Phase 3 接入）
 * - Cmd/Ctrl+B  折叠/展开 Chat Sidebar
 * - Cmd/Ctrl+1..7  切换页面
 */
const PAGE_SHORTCUTS = [
  "dashboard",
  "inbox",
  "tasks",
  "journal",
  "ideas",
  "reviews",
  "settings",
] as const;

export function useGlobalShortcuts() {
  const setPage = useAppStore((s) => s.setPage);
  const toggleChat = useAppStore((s) => s.toggleChatSidebar);
  const setQuickInput = useAppStore((s) => s.setQuickInputOpen);
  const setCommandPalette = useAppStore((s) => s.setCommandPaletteOpen);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd/Ctrl+K: 命令面板
      if (e.key === "k") {
        e.preventDefault();
        setCommandPalette(true);
        return;
      }

      // Cmd/Ctrl+I: 快速输入
      if (e.key === "i") {
        e.preventDefault();
        setQuickInput(true);
        return;
      }

      // Cmd/Ctrl+B: 折叠 Chat
      if (e.key === "b") {
        e.preventDefault();
        toggleChat();
        return;
      }

      // Cmd/Ctrl+1..7: 切换页面
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 7) {
        e.preventDefault();
        setPage(PAGE_SHORTCUTS[num - 1]);
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setPage, toggleChat, setQuickInput, setCommandPalette]);
}
