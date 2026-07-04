/**
 * 烛照业务状态徽章
 * 详见 docs/UI_UX_SPEC.md §10 状态颜色
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority, ReminderStatus } from "@/types/enums";

const STATUS_CLASS: Record<TaskStatus, string> = {
  inbox: "bg-zinc-400/15 text-zinc-300 border-zinc-400/30",
  planned: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  scheduled: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  doing: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  delayed: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  blocked: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  dropped: "bg-zinc-600/15 text-zinc-400 border-zinc-600/30 line-through",
  review_needed: "bg-yellow-400/15 text-yellow-300 border-yellow-400/30",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: "Inbox",
  planned: "Planned",
  scheduled: "Scheduled",
  doing: "Doing",
  done: "Done",
  delayed: "Delayed",
  blocked: "Blocked",
  dropped: "Dropped",
  review_needed: "Review",
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  medium: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  urgent: "bg-rose-600/10 text-rose-400 border-rose-600/20",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] px-1.5 py-0", STATUS_CLASS[status])}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] px-1.5 py-0", PRIORITY_CLASS[priority])}
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
    <div className="rounded-lg border border-rose-600/50 bg-rose-600/5 animate-pulse-harsh">
      {children}
    </div>
  );
}

/** Reminder 状态徽章（简化） */
export function ReminderStatusBadge({ status }: { status: ReminderStatus }) {
  const cls: Record<ReminderStatus, string> = {
    pending: "bg-zinc-400/15 text-zinc-300 border-zinc-400/30",
    fired: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    snoozed: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    resolved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    cancelled: "bg-zinc-600/15 text-zinc-400 border-zinc-600/30",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", cls[status])}>
      {status}
    </Badge>
  );
}
