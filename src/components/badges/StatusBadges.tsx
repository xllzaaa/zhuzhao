/**
 * 烛照业务状态徽章
 * - 中文标签
 * - 柔和胶囊样式
 * - 降饱和度配色
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority, ReminderStatus } from "@/types/enums";

const STATUS_CLASS: Record<TaskStatus, string> = {
  inbox: "bg-zinc-400/12 text-zinc-300 border-zinc-400/25",
  planned: "bg-sky-400/12 text-sky-300 border-sky-400/25",
  scheduled: "bg-sky-400/12 text-sky-300 border-sky-400/25",
  doing: "bg-amber-500/12 text-amber-300 border-amber-500/25",
  done: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25",
  delayed: "bg-orange-500/12 text-orange-300 border-orange-500/25",
  blocked: "bg-violet-500/12 text-violet-300 border-violet-500/25",
  dropped: "bg-zinc-500/12 text-zinc-400 border-zinc-500/25",
  review_needed: "bg-yellow-400/12 text-yellow-300 border-yellow-400/25",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: "收集",
  planned: "已排期",
  scheduled: "待开始",
  doing: "进行中",
  done: "已完成",
  delayed: "已延期",
  blocked: "阻塞",
  dropped: "已放弃",
  review_needed: "待回顾",
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: "bg-zinc-500/8 text-zinc-400 border-zinc-500/20",
  medium: "bg-sky-500/8 text-sky-400 border-sky-500/20",
  high: "bg-orange-500/8 text-orange-400 border-orange-500/20",
  urgent: "bg-rose-500/8 text-rose-400 border-rose-500/20",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

const REMINDER_CLASS: Record<ReminderStatus, string> = {
  pending: "bg-zinc-400/12 text-zinc-300 border-zinc-400/25",
  fired: "bg-amber-500/12 text-amber-300 border-amber-500/25",
  snoozed: "bg-sky-400/12 text-sky-300 border-sky-400/25",
  resolved: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25",
  cancelled: "bg-zinc-500/12 text-zinc-400 border-zinc-500/25",
};

const REMINDER_LABEL: Record<ReminderStatus, string> = {
  pending: "等待",
  fired: "已触发",
  snoozed: "已稍后",
  resolved: "已解决",
  cancelled: "已取消",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium tz-transition",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium tz-transition",
        PRIORITY_CLASS[priority],
      )}
    >
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

/** harsh 高亮（用于 delay_count >= 2 的任务） */
export function HarshHighlight({
  delayCount,
  children,
}: {
  delayCount: number;
  children: React.ReactNode;
}) {
  if (delayCount < 2) return <>{children}</>;
  return (
    <div className="rounded-xl border border-rose-500/40 bg-rose-500/5 animate-pulse-harsh">
      {children}
    </div>
  );
}

/** Reminder 状态徽章 */
export function ReminderStatusBadge({ status }: { status: ReminderStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium tz-transition",
        REMINDER_CLASS[status],
      )}
    >
      {REMINDER_LABEL[status]}
    </Badge>
  );
}
