/**
 * LeftNav - 左侧导航（Premium 精致化版）
 *
 * macOS sidebar selection 风格：
 * - bg-sidebar-layer 毛玻璃背景
 * - 选中态：bg-primary/10 + 左侧 2px 圆角竖条（更柔）
 * - 未选中：text-muted-foreground hover:bg-accent/40
 * - 快捷键默认 opacity-0，hover 行才显示
 * - Logo 区：烛字图标 + 烛照 + 个人 AI 助手
 * - 底部 AI 引擎状态胶囊（动态读取 active provider，不写死）
 */

import { useEffect, useState } from "react";
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
import * as llmProviderRepo from "@/lib/repositories/llm-provider-repo";

const NAV_ITEMS: (NavItem & { Icon: LucideIcon })[] = [
  { id: "dashboard", label: "首页", icon: "dashboard", shortcut: 1, Icon: LayoutDashboard },
  { id: "inbox", label: "收集", icon: "inbox", shortcut: 2, Icon: Inbox },
  { id: "tasks", label: "任务", icon: "tasks", shortcut: 3, Icon: CheckSquare },
  { id: "journal", label: "日记", icon: "journal", shortcut: 4, Icon: BookOpen },
  { id: "ideas", label: "灵感", icon: "ideas", shortcut: 5, Icon: Lightbulb },
  { id: "reviews", label: "总结", icon: "reviews", shortcut: 6, Icon: ClipboardList },
  { id: "settings", label: "设置", icon: "settings", shortcut: 7, Icon: Settings },
];

/**
 * AI 引擎状态（动态读取，不写死）
 *
 * 状态分类：
 * - connected：存在 active provider，显示「AI 引擎已连接 · {provider name}」
 * - unconfigured：无 active provider，显示「AI 引擎未配置」
 * - unknown：查询失败，显示「AI 状态未知」
 *
 * 安全：仅展示 provider.name（用户可读名），不展示 API Key / base_url / token / Authorization。
 */
type AiStatus =
  | { kind: "connected"; name: string }
  | { kind: "unconfigured" }
  | { kind: "unknown" };

function useAiStatus(): AiStatus {
  const [status, setStatus] = useState<AiStatus>({ kind: "unknown" });
  useEffect(() => {
    let cancelled = false;
    llmProviderRepo
      .getActive()
      .then((provider) => {
        if (cancelled) return;
        if (provider && provider.name) {
          setStatus({ kind: "connected", name: provider.name });
        } else {
          setStatus({ kind: "unconfigured" });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({ kind: "unknown" });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

export function LeftNav() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setPage = useAppStore((s) => s.setPage);
  const aiStatus = useAiStatus();

  // 状态视觉映射
  const statusVisual = {
    connected: {
      dotClass: "bg-emerald-400",
      textClass: "text-emerald-300/90",
      label: `AI 引擎已连接 · ${aiStatus.kind === "connected" ? aiStatus.name : ""}`,
    },
    unconfigured: {
      dotClass: "bg-muted-foreground/40",
      textClass: "text-muted-foreground",
      label: "AI 引擎未配置",
    },
    unknown: {
      dotClass: "bg-amber-400/80",
      textClass: "text-amber-300/80",
      label: "AI 状态未知",
    },
  }[aiStatus.kind];

  return (
    <nav className="relative flex h-full w-48 shrink-0 flex-col bg-sidebar-layer">
      {/* 右侧渐变细线分割（替代硬 border-r） */}
      <div className="pointer-events-none absolute right-0 top-0 h-full w-px divider-soft" aria-hidden="true" />

      {/* 烛照 Logo 区 */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary tz-transition shadow-sm shadow-primary/10">
          <span className="text-base font-semibold">烛</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">烛照</span>
          <span className="text-[10px] text-muted-foreground/80">个人 AI 助手</span>
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
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              {/* 左侧 2px 圆角竖条（更柔） */}
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary/80"
                  aria-hidden="true"
                />
              )}
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 tz-transition",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
                strokeWidth={2}
              />
              <span className="flex-1 text-left">{label}</span>
              {/* 快捷键默认隐藏，hover 才显示 */}
              <span
                className={cn(
                  "text-[10px] tabular-nums tz-transition",
                  active
                    ? "text-primary/40"
                    : "text-muted-foreground/0 group-hover:text-muted-foreground/60",
                )}
              >
                ⌘{shortcut}
              </span>
            </button>
          );
        })}
      </div>

      {/* 底部：AI 引擎状态（动态） */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5 tz-transition">
          <span className={cn("h-1.5 w-1.5 rounded-full", statusVisual.dotClass)} />
          <span className={cn("text-[10px]", statusVisual.textClass)}>
            {statusVisual.label}
          </span>
        </div>
      </div>
    </nav>
  );
}
