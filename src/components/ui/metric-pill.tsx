/**
 * MetricPill - Hero 右侧数字小胶囊
 *
 * 用于展示今日关键数字（今日到期 / 逾期 / 延期 / 输入）。
 *
 * 视觉特征：
 * - rounded-full 胶囊
 * - 半透明背景
 * - 数字用 tabular-nums 等宽
 * - 可选 tone：default / warn / danger
 * - 可点击（onClick 可选，用于跳转）
 *
 * 排版规范（C++ 批次）：
 * - 统一 h-10（2×2 grid 严格对齐）
 * - 内部 flex items-center justify-between gap-2
 * - label text-[11px] text-muted-foreground/70
 * - number text-base font-semibold tabular-nums
 * - 数字与标签基线对齐
 */

import { cn } from "@/lib/utils";

interface MetricPillProps {
  label: string;
  value: number | string;
  tone?: "default" | "warn" | "danger";
  onClick?: () => void;
  className?: string;
}

const TONE_CLASS = {
  default: "bg-card/40 text-foreground hover:bg-card/60",
  warn: "bg-amber-500/10 text-amber-300 hover:bg-amber-500/15",
  danger: "bg-rose-500/10 text-rose-300 hover:bg-rose-500/15",
} as const;

export function MetricPill({
  label,
  value,
  tone = "default",
  onClick,
  className,
}: MetricPillProps) {
  const cls = cn(
    // h-10 统一高度，让 2×2 grid 严格对齐
    "inline-flex h-10 w-full items-center justify-between gap-2 rounded-full px-3.5",
    "tz-transition",
    onClick && "cursor-pointer",
    TONE_CLASS[tone],
    className,
  );

  const content = (
    <>
      <span className="text-[11px] text-muted-foreground/70">{label}</span>
      <span className="text-base font-semibold tabular-nums leading-none">
        {value}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}
