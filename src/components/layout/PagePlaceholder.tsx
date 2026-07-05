import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PagePlaceholderProps {
  /** 页面标题 */
  title: string;
  /** 副标题 / 描述 */
  description?: string;
  /** 图标 */
  icon?: LucideIcon;
  /** 空状态提示文案 */
  emptyHint?: string;
  /** 右上角主操作按钮（占位） */
  action?: React.ReactNode;
  /** 子内容 */
  children?: React.ReactNode;
}

/**
 * 页面占位骨架 - Phase 1 通用
 * Phase 2 起替换为真实内容
 */
export function PagePlaceholder({
  title,
  description,
  icon: Icon,
  emptyHint = "还没有内容",
  action,
  children,
}: PagePlaceholderProps) {
  return (
    <div className="flex h-full flex-col">
      {/* PageHeader */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary tz-transition">
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </div>
          )}
          <div className="flex flex-col leading-tight">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action}
      </header>

      {/* PageBody */}
      <div className="flex-1 overflow-auto p-6">
        {children ?? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            {Icon && (
              <Icon className="h-16 w-16 text-primary/30" strokeWidth={1.5} />
            )}
            <div>
              <p className="text-sm text-muted-foreground">{emptyHint}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/60">
                当前页面：{title}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 标准卡片占位 */
export function PlaceholderCard({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 tz-transition",
        className,
      )}
    >
      {title && (
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          {title}
        </h3>
      )}
      {children ?? (
        <div className="flex h-20 items-center justify-center text-xs text-muted-foreground/50">
          占位卡片
        </div>
      )}
    </div>
  );
}
