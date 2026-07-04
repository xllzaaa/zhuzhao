import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  BookOpen,
  Lightbulb,
  ClipboardList,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import type { NavItem, PageId } from "@/types/app";
import { cn } from "@/lib/utils";

const NAV_ITEMS: (NavItem & { Icon: LucideIcon })[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", shortcut: 1, Icon: LayoutDashboard },
  { id: "inbox", label: "Inbox", icon: "inbox", shortcut: 2, Icon: Inbox },
  { id: "tasks", label: "Tasks", icon: "tasks", shortcut: 3, Icon: CheckSquare },
  { id: "journal", label: "Journal", icon: "journal", shortcut: 4, Icon: BookOpen },
  { id: "ideas", label: "Ideas", icon: "ideas", shortcut: 5, Icon: Lightbulb },
  { id: "reviews", label: "Reviews", icon: "reviews", shortcut: 6, Icon: ClipboardList },
  { id: "settings", label: "Settings", icon: "settings", shortcut: 7, Icon: Settings },
];

export function LeftNav() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setPage = useAppStore((s) => s.setPage);

  return (
    <nav className="flex h-full w-16 flex-col items-center border-r border-border bg-card py-3">
      {/* 烛照 Logo */}
      <div
        className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"
        title="烛照"
      >
        <span className="text-lg font-semibold">烛</span>
      </div>

      {/* 导航项 */}
      <div className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ id, label, shortcut, Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id as PageId)}
            title={`${label} (⌘${shortcut})`}
            className={cn(
              "group relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors",
              currentPage === id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
            {/* 快捷键提示 */}
            <span className="absolute bottom-0.5 right-1 text-[9px] text-muted-foreground/60">
              {shortcut}
            </span>
          </button>
        ))}
      </div>

      {/* 底部：LLM 状态点（占位） */}
      <div
        className="mb-2 h-2 w-2 rounded-full bg-muted-foreground/40"
        title="LLM Provider 未配置"
      />
    </nav>
  );
}
