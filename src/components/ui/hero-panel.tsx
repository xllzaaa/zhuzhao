/**
 * HeroPanel - Dashboard 顶部 Hero 区
 *
 * L1 最高权重容器，用于展示烛照判断 + MetricPills。
 *
 * 视觉特征：
 * - rounded-3xl 大圆角
 * - 柔和烛光渐变背景（from-primary/[0.06] to-transparent）
 * - backdrop-blur-sm 轻毛玻璃
 * - shadow-2xl shadow-black/20 轻阴影
 * - 无硬边框
 *
 * 用法：
 * <HeroPanel>
 *   <div className="flex">左侧文案</div>
 *   <div className="flex">右侧 MetricPills</div>
 * </HeroPanel>
 */

import * as React from "react";
import { cn } from "@/lib/utils";

const HeroPanel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative overflow-hidden rounded-3xl border border-border/20",
      "bg-gradient-to-br from-primary/[0.06] via-card/40 to-transparent",
      "backdrop-blur-sm",
      "shadow-2xl shadow-black/20",
      "tz-transition",
      className,
    )}
    {...props}
  />
));
HeroPanel.displayName = "HeroPanel";

export { HeroPanel };
