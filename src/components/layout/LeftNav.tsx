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
  { id: "dashboard", label: "首页", icon: "dashboard", shortcut: 1, Icon: LayoutDashboard },
  { id: "inbox", label: "收集", icon: "inbox", shortcut: 2, Icon: Inbox },
  { id: "tasks", label: "任务", icon: "tasks", shortcut: 3, Icon: CheckSquare },
  { id: "journal", label: "日记", icon: "journal", shortcut: 4, Icon: BookOpen },
  { id: "ideas", label: "灵感", icon: "ideas", shortcut: 5, Icon: Lightbulb },
  { id: "reviews", label: "总结", icon: "reviews", shortcut: 6, Icon: ClipboardList },
  { id: "settings", label: "设置", icon: "settings", shortcut: 7, Icon: Settings },
];

export function LeftNav() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setPage = useAppStore((s) => s.setPage);

  return (
    <nav className="flex h-full w-48 shrink-0 flex-col border-r border-border bg-card/60 backdrop-blur-sm">
      {/* 烛照 Logo 区 */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary tz-transition">
          <span className="text-base font-semibold">烛</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">烛照</span>
          <span className="text-[10px] text-muted-foreground">个人 AI 助手</span>
        </div>
      </div>

      {/* 导航项 */}
      <div className="flex flex-1 flex-col gap-0.5 px-2 py-1">
        {NAV_ITEMS.map(({ id, label, shortcut, Icon }) => {
          const active = currentPage === id;
          return (
            <button
              key={id}
              onClick={() => setPage(id as PageId)}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm tz-transition",
                active
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
              <span className="flex-1 text-left">{label}</span>
              <span className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground/90">
                ⌘{shortcut}
              </span>
            </button>
          );
        })}
      </div>

      {/* 底部：AI 引擎状态 */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 tz-transition">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground">AI 引擎未配置</span>
        </div>
      </div>
    </nav>
  );
}
