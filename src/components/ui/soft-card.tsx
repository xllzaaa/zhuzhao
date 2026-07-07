/**
 * SoftCard - 次级卡片（L3）
 *
 * 比默认 Card 更柔：
 * - 边框 border-border/20（更弱）
 * - 背景 bg-card/50（半透明）
 * - 无阴影或 shadow-sm
 * - hover 轻提亮
 *
 * 用于：今日到期、总结、监督列、底部 Activity Grid。
 * 不用于：Hero（用 HeroPanel）、主任务卡（未来用 FocusCard）。
 */

import * as React from "react";
import { cn } from "@/lib/utils";

const SoftCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border/20 bg-card/50",
      "tz-transition hover:bg-card/70 hover:border-border/30",
      className,
    )}
    {...props}
  />
));
SoftCard.displayName = "SoftCard";

const SoftCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pb-2", className)} {...props} />
));
SoftCardHeader.displayName = "SoftCardHeader";

const SoftCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-2", className)} {...props} />
));
SoftCardContent.displayName = "SoftCardContent";

export { SoftCard, SoftCardHeader, SoftCardContent };
