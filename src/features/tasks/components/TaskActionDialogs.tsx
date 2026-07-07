/**
 * 任务操作 Dialog 集合（UX-3B）
 *
 * 替换 Tasks 页的 window.prompt，统一为烛照风格 Dialog。
 * 仅替换 UI 交互，不改 task-ops 语义。
 *
 * 包含：
 *   - DelayTaskDialog       延期任务
 *   - SnoozeReminderDialog  稍后提醒
 *   - ActivateTaskDialog    开始推进
 *   - CompleteTaskDialog     完成任务
 */

import { useEffect, useState } from "react";
import {
  Clock,
  BellRing,
  Plus,
  CheckCircle2,
  X,
  Calendar,
} from "lucide-react";
import type { TaskRow, ReminderRow } from "@/types/db";
import {
  delayTask,
  snoozeReminder,
  activateTask,
  markDone,
} from "@/lib/supervision/task-ops";
import { listActiveByTaskId } from "@/lib/repositories/reminder-repo";
import { toast } from "sonner";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// 共用：Dialog 容器
// ---------------------------------------------------------------------------

function TaskActionDialogShell({
  title,
  subtitle,
  icon: Icon,
  onClose,
  onSubmit,
  submitLabel,
  submitIcon: SubmitIcon,
  submitDisabled,
  submitting,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Clock;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitIcon: typeof Clock;
  submitDisabled?: boolean;
  submitting?: boolean;
  children: React.ReactNode;
}) {
  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-[18vh] w-full max-w-lg rounded-2xl border border-border/20 bg-card/90 shadow-2xl shadow-black/40 backdrop-blur-xl tz-transition"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border/20 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium">{title}</span>
              <span className="text-[10px] text-muted-foreground/70">
                {subtitle}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent/60 hover:text-foreground tz-transition"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 表单 */}
        <div className="flex flex-col gap-4 p-5">{children}</div>

        {/* 底部 */}
        <div className="flex items-center justify-between border-t border-border/20 px-5 py-3">
          <span className="text-[10px] text-muted-foreground/60">
            ⌘+Enter 确认 · ESC 关闭
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground tz-transition"
            >
              取消
            </button>
            <button
              onClick={onSubmit}
              disabled={submitDisabled || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-sm shadow-primary/20 tz-transition hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:saturate-50"
            >
              <SubmitIcon className="h-3 w-3" />
              {submitting ? "处理中..." : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 共用：任务标题展示
// ---------------------------------------------------------------------------

function TaskTitleDisplay({ task }: { task: TaskRow }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2">
      <div className="text-[10px] font-medium text-muted-foreground/70 mb-0.5">
        当前任务
      </div>
      <div className="text-sm font-medium text-foreground/90 truncate">
        {task.title}
      </div>
      {task.due_at && (
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Calendar className="h-2.5 w-2.5" />
          <span className="tabular-nums">
            当前截止 {format(new Date(task.due_at), "yyyy-MM-dd HH:mm")}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 共用：时间输入校验
// ---------------------------------------------------------------------------

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min] = match;
  const localDate = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(h),
    Number(min),
  );
  if (isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

// =========================================================================
// 1. DelayTaskDialog — 延期任务
// =========================================================================

export function DelayTaskDialog({
  task,
  onClose,
  onChanged,
}: {
  task: TaskRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newDueAt, setNewDueAt] = useState(() =>
    task.due_at
      ? toDatetimeLocal(task.due_at)
      : toDatetimeLocal(new Date().toISOString()),
  );
  const [reason, setReason] = useState(task.failure_reason ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const newDueIso = fromDatetimeLocal(newDueAt);
    if (!newDueIso) {
      toast.error("时间格式错误", {
        description: "请选择有效的截止时间",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await delayTask(task.id, {
        newDueAt: newDueIso,
        reason: reason.trim() || null,
        newStatus: "delayed",
      });
      if (result.ok) {
        toast.success("任务已延期", {
          description: `"${task.title}" 已延期到 ${format(new Date(newDueIso), "MM-dd HH:mm")}（累计 ${result.data.task.delay_count} 次）`,
        });
        onClose();
        onChanged();
      } else {
        toast.error("延期失败", { description: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("延期异常", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TaskActionDialogShell
      title="延期任务"
      subtitle="设一个新的截止时间"
      icon={Clock}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="确认延期"
      submitIcon={Clock}
      submitting={submitting}
    >
      <TaskTitleDisplay task={task} />
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80">
          <Calendar className="h-3 w-3" />
          新截止时间 <span className="text-destructive">*</span>
        </label>
        <input
          type="datetime-local"
          autoFocus
          value={newDueAt}
          onChange={(e) => setNewDueAt(e.target.value)}
          className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground/80">
          延期原因（可选）
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="为什么延期？写一句原因，烛照会记住。"
          rows={3}
          className="w-full resize-none rounded-lg border border-border/40 bg-background/60 p-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </TaskActionDialogShell>
  );
}

// =========================================================================
// 2. SnoozeReminderDialog — 稍后提醒
// =========================================================================

export function SnoozeReminderDialog({
  task,
  reminder,
  onClose,
  onChanged,
}: {
  task: TaskRow;
  reminder: ReminderRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const defaultAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const [remindAt, setRemindAt] = useState(defaultAt);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const newRemindIso = fromDatetimeLocal(remindAt);
    if (!newRemindIso) {
      toast.error("时间格式错误", {
        description: "请选择有效的提醒时间",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await snoozeReminder(reminder.id, newRemindIso);
      if (result.ok) {
        toast.success("已稍后提醒", {
          description: `${format(new Date(newRemindIso), "MM-dd HH:mm")} 再追问`,
        });
        onClose();
        onChanged();
      } else {
        toast.error("稍后失败", { description: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("稍后异常", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TaskActionDialogShell
      title="稍后提醒"
      subtitle="让烛照稍后再来追问"
      icon={BellRing}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="设为稍后提醒"
      submitIcon={BellRing}
      submitting={submitting}
    >
      <TaskTitleDisplay task={task} />
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80">
          <BellRing className="h-3 w-3" />
          提醒时间 <span className="text-destructive">*</span>
        </label>
        <input
          type="datetime-local"
          autoFocus
          value={remindAt}
          onChange={(e) => setRemindAt(e.target.value)}
          className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <p className="text-[10px] text-muted-foreground/60">
          到这个时间，烛照会再来追问这件事。
        </p>
      </div>
    </TaskActionDialogShell>
  );
}

// =========================================================================
// 3. ActivateTaskDialog — 开始推进
// =========================================================================

export function ActivateTaskDialog({
  task,
  onClose,
  onChanged,
}: {
  task: TaskRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const defaultDue = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const [dueAt, setDueAt] = useState(defaultDue);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const dueIso = fromDatetimeLocal(dueAt);
    if (!dueIso) {
      toast.error("时间格式错误", {
        description: "请选择有效的截止时间",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await activateTask(task.id, { dueAt: dueIso });
      if (result.ok) {
        toast.success("任务已激活", {
          description: `"${task.title}" 已排期到 ${format(new Date(dueIso), "MM-dd HH:mm")}`,
        });
        onClose();
        onChanged();
      } else {
        toast.error("激活失败", { description: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("激活异常", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TaskActionDialogShell
      title="开始推进"
      subtitle="给这件事一个明确的截止时间"
      icon={Plus}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="开始推进"
      submitIcon={Plus}
      submitting={submitting}
    >
      <TaskTitleDisplay task={task} />
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80">
          <Calendar className="h-3 w-3" />
          截止时间 <span className="text-destructive">*</span>
        </label>
        <input
          type="datetime-local"
          autoFocus
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <p className="text-[10px] text-muted-foreground/60">
          烛照会在截止前再次追问。
        </p>
      </div>
    </TaskActionDialogShell>
  );
}

// =========================================================================
// 4. CompleteTaskDialog — 完成任务
// =========================================================================

export function CompleteTaskDialog({
  task,
  onClose,
  onChanged,
}: {
  task: TaskRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await markDone(task.id, {
        completionNote: note.trim() || null,
      });
      if (result.ok) {
        toast.success("任务已完成", {
          description: task.title,
        });
        onClose();
        onChanged();
      } else {
        toast.error("完成失败", { description: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("完成异常", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TaskActionDialogShell
      title="完成任务"
      subtitle="为今天这件推进画个句号"
      icon={CheckCircle2}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="标记完成"
      submitIcon={CheckCircle2}
      submitting={submitting}
    >
      <TaskTitleDisplay task={task} />
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground/80">
          完成备注（可选）
        </label>
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="写一句结果或总结，或者留空。"
          rows={3}
          className="w-full resize-none rounded-lg border border-border/40 bg-background/60 p-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
      </div>
    </TaskActionDialogShell>
  );
}

// =========================================================================
// 辅助：查找任务的 active reminder（用于 SnoozeReminderDialog）
// =========================================================================

export async function findActiveReminder(
  taskId: string,
): Promise<ReminderRow | null> {
  const reminders = await listActiveByTaskId(taskId);
  return reminders.length > 0 ? reminders[0] : null;
}
