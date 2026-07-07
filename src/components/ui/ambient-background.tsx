/**
 * AmbientBackground - 全局氛围背景
 *
 * 极轻烛光 ambient（opacity 0.04-0.08），制造空间层次，不是视觉特效。
 * 目标：微弱烛光氛围，让人一打开就知道是烛照。
 *
 * 用法：在 App 根布局外层包裹，作为 body 之后的第一个视觉层。
 * 不影响布局，pointer-events-none。
 */

import { cn } from "@/lib/utils";

interface AmbientBackgroundProps {
  className?: string;
  /** 烛光强度（默认 0.06，范围 0.04-0.08） */
  intensity?: "subtle" | "normal" | "strong";
}

const INTENSITY_MAP = {
  subtle: 0.04,
  normal: 0.06,
  strong: 0.08,
} as const;

export function AmbientBackground({
  className,
  intensity = "normal",
}: AmbientBackgroundProps) {
  const amberOpacity = INTENSITY_MAP[intensity];
  const coolOpacity = amberOpacity * 0.6; // 冷光更弱

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-0 z-0 overflow-hidden",
        className,
      )}
      style={{
        background: `
          radial-gradient(circle at 18% 0%, hsl(38 76% 60% / ${amberOpacity}), transparent 32%),
          radial-gradient(circle at 92% 8%, hsl(220 30% 60% / ${coolOpacity}), transparent 26%)
        `,
      }}
    />
  );
}
