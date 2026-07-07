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
  /** Header 尺寸：default 标准 / compact 紧凑（Dashboard 用，让 Hero 成为第一视觉中心） */
  headerSize?: "default" | "compact";
  /** 主内容最大宽度（默认无限制） */
  maxWidth?: number;
  /** 是否完全隐藏 Header（Dashboard 用，让 Hero 承担主标题） */
  hideHeader?: boolean;
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
  headerSize = "default",
  maxWidth,
  hideHeader = false,
}: PagePlaceholderProps) {
  const isCompact = headerSize === "compact";
  return (
    <div className="flex h-full flex-col">
      {/* PageHeader - hideHeader 时完全不渲染，让 Hero 承担主标题 */}
      {!hideHeader && (
        <header
          className={cn(
            "flex items-center justify-between border-b border-border/40 px-6",
            isCompact ? "h-12 py-2" : "py-4",
          )}
        >
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div
                className={cn(
                  "flex items-center justify-center rounded-lg bg-primary/10 text-primary tz-transition",
                  isCompact ? "h-6 w-6" : "h-9 w-9",
                )}
              >
                <Icon
                  className={isCompact ? "h-3 w-3" : "h-[18px] w-[18px]"}
                  strokeWidth={2}
                />
              </div>
            )}
            <div className="flex flex-col leading-tight">
              <h1
                className={cn(
                  "font-semibold tracking-tight",
                  isCompact ? "text-xs text-muted-foreground/70" : "text-lg",
                )}
              >
                {title}
              </h1>
              {description && !isCompact && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {action}
        </header>
      )}

      {/* PageBody - 主内容最大宽度收窄，居中 */}
      <div className={cn("flex-1 overflow-auto", hideHeader ? "p-6" : "p-6")}>
        <div
          className="mx-auto w-full"
          style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}
        >
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
