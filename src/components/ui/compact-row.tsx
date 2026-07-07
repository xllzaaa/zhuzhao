/**
 * CompactRow - 活动列表行（L4）
 *
 * 最弱权重的列表项，用于底部 Activity Grid / Risk Strip 列表。
 *
 * 视觉特征：
 * - 无边框、无背景（hover 才有 bg-accent/30）
 * - rounded-lg
 * - 左侧可选 2px 风险细条（risk: overdue / delay / harsh）
 * - 内容靠左侧细条 padding 让位
 * - 紧凑（py-1.5 px-2.5）
 *
 * 排版规范（C++ 批次）：
 * - 统一 min-h-9，行高一致
 * - 内部 flex items-center justify-between
 * - 左侧 title truncate text-xs
 * - 右侧 meta/action 通过 rightSlot prop 传入
 * - 右侧统一结构：flex shrink-0 items-center gap-2 text-[11px]
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface CompactRowProps extends React.HTMLAttributes<HTMLDivElement> {
  risk?: "overdue" | "delay" | "harsh";
  /** 右侧 meta/action slot - 应为 flex 容器 */
  rightSlot?: React.ReactNode;
}

const RISK_BAR_CLASS = {
  overdue: "bg-rose-500/70",
  delay: "bg-amber-500/70",
  harsh: "bg-pink-400/70",
} as const;

export const CompactRow = React.forwardRef<HTMLDivElement, CompactRowProps>(
  ({ className, risk, children, rightSlot, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5",
        "hover:bg-accent/30 tz-transition",
        risk && "pl-3.5",
        className,
      )}
      {...props}
    >
      {risk && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0.5 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full",
            RISK_BAR_CLASS[risk],
          )}
        />
      )}
      {/* 左侧 title - flex-1 truncate */}
      <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">
        {children}
      </span>
      {/* 右侧 meta/action slot */}
      {rightSlot && (
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground/60">
          {rightSlot}
        </div>
      )}
    </div>
  ),
);
CompactRow.displayName = "CompactRow";
