/**
 * SectionHeader - 区块标题
 *
 * 比 SectionTitle 更产品化：
 * - icon + 中文名 + 可选 count + 可选 action
 * - 字号 text-xs font-medium
 * - opacity-60 弱化
 * - icon 颜色按 tone
 *
 * 用于：Dashboard 各区 / Tasks summary / Journal Daily Brief 等。
 */

import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps
  extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  count?: number | string;
  tone?: "default" | "warn" | "danger";
  action?: React.ReactNode;
}

const TONE_ICON_CLASS = {
  default: "text-muted-foreground",
  warn: "text-amber-400",
  danger: "text-rose-400",
} as const;

export function SectionHeader({
  icon: Icon,
  title,
  count,
  tone = "default",
  action,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", TONE_ICON_CLASS[tone])} strokeWidth={2} />
        <h3 className="text-xs font-medium text-foreground/70">{title}</h3>
        {count !== undefined && count !== null && (
          <span className="text-pill rounded-full bg-secondary/60 px-1.5 py-0 text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
