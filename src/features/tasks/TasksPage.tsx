/**
 * Tasks Page
 *
 * Phase 6 改造 + UX-3A/3B 交互增强：
 * - 7 个 tabs：今日 / Inbox / Active / Delayed / Done / Archived / 全部
 * - 顶部按钮：「新建任务」（Plus 图标）+ 「刷新」（RefreshCw 图标 ghost）
 * - 任务卡片支持点击展开详情（一次只展开一个）
 * - 任务操作：完成 / 延期 / 稍后提醒 / 开始推进（全部 stopPropagation）
 * - 新建任务 Dialog：标题（必填）+ 描述 + 截止时间 + 优先级
 * - UX-3B：所有 window.prompt 已替换为烛照风格 Dialog
 */

import { useEffect, useState, useCallback } from "react";
import {
  CheckSquare,
  Plus,
  CheckCircle2,
  Clock,
  CalendarClock,
  AlertTriangle,
  BellRing,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
  Flag,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import {
  TaskStatusBadge,
  TaskPriorityBadge,
  HarshHighlight,
} from "@/components/badges/StatusBadges";
import type { TaskRow, ReminderRow, PomodoroSessionRow } from "@/types/db";
import type { TaskPriority } from "@/types/enums";
import {
  listDueToday,
  listInbox,
  listActive,
  listDelayed,
  listDone,
  listArchived,
  listAllNotDone,
  createTask,
} from "@/lib/repositories/task-repo";
import { listPomodoroSessionsByTaskId } from "@/lib/repositories/pomodoro-repo";
import { startPomodoro, PomodoroError } from "@/lib/pomodoro/pomodoro-ops";
import { nowIso } from "@/lib/id";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { markDone } from "@/lib/supervision/task-ops";
import {
  DelayTaskDialog,
  SnoozeReminderDialog,
  ActivateTaskDialog,
  findActiveReminder,
} from "@/features/tasks/components/TaskActionDialogs";

type TaskTab =
  | "today"
  | "inbox"
  | "active"
  | "delayed"
  | "done"
  | "archived"
  | "all";

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

export function TasksPage() {
  const [tab, setTab] = useState<TaskTab>("today");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // UX-3B: 3 个操作 Dialog 状态（完成恢复为一键完成，不弹 Dialog）
  const [delayTask_, setDelayTask] = useState<TaskRow | null>(null);
  const [snoozeTarget, setSnoozeTarget] = useState<{
    task: TaskRow;
    reminder: ReminderRow;
  } | null>(null);
  const [activateTarget, setActivateTarget] = useState<TaskRow | null>(null);

  const reload = useCallback(async (which: TaskTab) => {
    setLoading(true);
    setError(null);
    try {
      let rows: TaskRow[];
      switch (which) {
        case "today":
          rows = await listDueToday();
          break;
        case "inbox":
          rows = await listInbox();
          break;
        case "active":
          rows = await listActive();
          break;
        case "delayed":
          rows = await listDelayed();
          break;
        case "done":
          rows = await listDone();
          break;
        case "archived":
          rows = await listArchived();
          break;
        case "all":
          rows = await listAllNotDone();
          break;
      }
      setTasks(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload(tab);
  }, [tab, reload]);

  const handleRefresh = () => reload(tab);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <PagePlaceholder
      title="任务"
      description="推进、延期、完成，都在这里看清"
      icon={CheckSquare}
      emptyHint="还没有任务，说一句话，烛照会帮你拆。"
      action={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={loading}
            className="h-9 w-9"
            title="刷新"
            aria-label="刷新"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="h-9">
            <Plus className="mr-1.5 h-4 w-4" />
            新建任务
          </Button>
        </div>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TaskTab)}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="today">今日</TabsTrigger>
          <TabsTrigger value="inbox">收集</TabsTrigger>
          <TabsTrigger value="active">进行中</TabsTrigger>
          <TabsTrigger value="delayed">延期</TabsTrigger>
          <TabsTrigger value="done">已完成</TabsTrigger>
          <TabsTrigger value="archived">已归档</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          加载失败：{error}
        </div>
      )}

      {loading && tasks.length === 0 && (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          加载中...
        </div>
      )}

      {!loading && tasks.length === 0 && !error && (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground/50">
          {tab === "today" && "今日无到期任务"}
          {tab === "inbox" && "收集箱为空"}
          {tab === "active" && "暂无进行中任务"}
          {tab === "delayed" && "暂无延期任务"}
          {tab === "done" && "暂无已完成任务"}
          {tab === "archived" && "暂无归档任务"}
          {tab === "all" && "暂无任务"}
        </div>
      )}

      {tasks.length > 0 && (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="flex flex-col gap-2 pr-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                expanded={expandedId === task.id}
                onToggleExpand={() => toggleExpand(task.id)}
                onChange={handleRefresh}
                onDelay={() => setDelayTask(task)}
                onSnooze={async () => {
                  const reminder = await findActiveReminder(task.id);
                  if (!reminder) {
                    toast.warning("无待触发的提醒", {
                      description: "此任务没有待触发的提醒，可使用『延期』创建新的。",
                    });
                    return;
                  }
                  setSnoozeTarget({ task, reminder });
                }}
                onActivate={() => setActivateTarget(task)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* 新建任务 Dialog */}
      {createOpen && (
        <CreateTaskDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            handleRefresh();
          }}
        />
      )}

      {/* UX-3B: 3 个操作 Dialog（完成恢复为一键完成，不弹 Dialog） */}
      {delayTask_ && (
        <DelayTaskDialog
          task={delayTask_}
          onClose={() => setDelayTask(null)}
          onChanged={handleRefresh}
        />
      )}
      {snoozeTarget && (
        <SnoozeReminderDialog
          task={snoozeTarget.task}
          reminder={snoozeTarget.reminder}
          onClose={() => setSnoozeTarget(null)}
          onChanged={handleRefresh}
        />
      )}
      {activateTarget && (
        <ActivateTaskDialog
          task={activateTarget}
          onClose={() => setActivateTarget(null)}
          onChanged={handleRefresh}
        />
      )}
    </PagePlaceholder>
  );
}

// ---------------------------------------------------------------------------
// 新建任务 Dialog
// ---------------------------------------------------------------------------

function CreateTaskDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [submitting, setSubmitting] = useState(false);

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

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;
    setSubmitting(true);
    try {
      const dueAtIso = dueAt ? fromDatetimeLocal(dueAt) : null;
      const task = await createTask({
        title: trimmedTitle,
        description: description.trim() || null,
        due_at: dueAtIso,
        priority,
        status: "inbox",
      });
      toast.success("任务已创建", {
        description: task.title,
      });
      // 清空表单
      setTitle("");
      setDescription("");
      setDueAt("");
      setPriority("medium");
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("创建失败", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

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
              <Plus className="h-4 w-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium">新建任务</span>
              <span className="text-[10px] text-muted-foreground/70">
                写下一件要推进的事
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
        <div className="flex flex-col gap-4 p-5">
          {/* 标题（必填） */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80">
              标题 <span className="text-destructive">*</span>
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="想做什么？"
              className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          {/* 描述（可选） */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80">
              描述（可选）
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="多写两句细节，或者留空"
              rows={3}
              className="w-full resize-none rounded-lg border border-border/40 bg-background/60 p-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* 截止时间 + 优先级 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80">
                <Calendar className="h-3 w-3" />
                截止时间（可选）
              </label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80">
                <Flag className="h-3 w-3" />
                优先级
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between border-t border-border/20 px-5 py-3">
          <span className="text-[10px] text-muted-foreground/60">
            ⌘+Enter 创建 · ESC 关闭
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground tz-transition"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-sm shadow-primary/20 tz-transition hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:saturate-50"
            >
              <Plus className="h-3 w-3" />
              {submitting ? "创建中..." : "创建任务"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 任务卡片（含操作按钮 + 展开详情）
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  expanded,
  onToggleExpand,
  onDelay,
  onSnooze,
  onActivate,
  onChange,
}: {
  task: TaskRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelay: () => void;
  onSnooze: () => void;
  onActivate: () => void;
  onChange: () => void;
}) {
  const isHarsh = task.delay_count >= 2;
  const isOverdue =
    task.due_at !== null &&
    task.due_at < nowIso() &&
    task.status !== "done" &&
    task.status !== "dropped";

  // Pomodoro V1：任务维度番茄记录（展开时加载）
  const [taskPomodoros, setTaskPomodoros] = useState<PomodoroSessionRow[]>([]);
  const [pomoLoading, setPomoLoading] = useState(false);
  const [pomoStarting, setPomoStarting] = useState(false);

  useEffect(() => {
    if (!expanded) {
      setTaskPomodoros([]);
      return;
    }
    let cancelled = false;
    setPomoLoading(true);
    listPomodoroSessionsByTaskId(task.id)
      .then((rows) => {
        if (!cancelled) setTaskPomodoros(rows);
      })
      .catch(() => {
        if (!cancelled) setTaskPomodoros([]);
      })
      .finally(() => {
        if (!cancelled) setPomoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, task.id]);

  const handleStartPomodoro = async () => {
    if (pomoStarting) return;
    setPomoStarting(true);
    try {
      const session = await startPomodoro({
        task_id: task.id,
        title: task.title,
        planned_minutes: 25,
      });
      toast.success("番茄已开始", {
        description: `${session.title} · 25 分钟`,
      });
      // 刷新任务维度番茄记录
      try {
        const rows = await listPomodoroSessionsByTaskId(task.id);
        setTaskPomodoros(rows);
      } catch {
        // ignore
      }
    } catch (err) {
      if (err instanceof PomodoroError) {
        toast.warning("已有番茄进行中", { description: "请先完成或放弃当前番茄" });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Pomodoro] 启动失败", err);
        toast.error("启动失败", { description: msg });
      }
    } finally {
      setPomoStarting(false);
    }
  };

  // 任务维度番茄统计
  const completedCount = taskPomodoros.filter((s) => s.status === "completed").length;
  const focusSeconds = taskPomodoros
    .filter((s) => s.status === "completed")
    .reduce((acc, s) => acc + s.actual_seconds, 0);
  const focusMinutes = Math.round(focusSeconds / 60);

  return (
    <HarshHighlight delayCount={task.delay_count}>
      <div
        className={cn(
          "rounded-xl border p-3 transition-all duration-150 ease-out cursor-pointer tz-transition",
          expanded
            ? "border-primary/30 bg-card/80"
            : isOverdue
              ? "border-rose-500/30 bg-rose-500/[0.04] hover:bg-rose-500/[0.08]"
              : isHarsh
                ? "border-rose-500/25 hover:bg-accent/30"
                : "border-border/50 bg-card/80 hover:bg-accent/30 hover:border-border",
        )}
        onClick={onToggleExpand}
        title={expanded ? "收起详情" : "展开详情"}
        role="button"
      >
        {/* 标题行 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium truncate">
              {task.title}
            </h3>
            {task.description && !expanded && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <TaskStatusBadge status={task.status} />
            <TaskPriorityBadge priority={task.priority} />
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground/60" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
            )}
          </div>
        </div>

        {/* 元信息行（收起态） */}
        {!expanded && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {task.due_at && (
              <span
                className={cn(
                  "flex items-center gap-0.5",
                  isOverdue && "text-rose-400/90",
                )}
              >
                <CalendarClock className="h-2.5 w-2.5" />
                {format(new Date(task.due_at), "MM-dd HH:mm")}
                {isOverdue && " · 逾期"}
              </span>
            )}
            {task.delay_count > 0 && (
              <span
                className={cn(
                  "flex items-center gap-0.5",
                  isHarsh ? "text-rose-400/90" : "text-amber-400/90",
                )}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                延期 {task.delay_count} 次
              </span>
            )}
            {task.failure_reason && (
              <span className="truncate text-muted-foreground/70">
                原因：{task.failure_reason}
              </span>
            )}
            {task.completed_at && (
              <span className="flex items-center gap-0.5 text-emerald-400/90">
                <CheckCircle2 className="h-2.5 w-2.5" />
                完成于 {format(new Date(task.completed_at), "MM-dd HH:mm")}
              </span>
            )}
          </div>
        )}

        {/* 展开态：完整详情 */}
        {expanded && (
          <div className="mt-3 flex flex-col gap-3 border-t border-border/30 pt-3">
            <DetailField
              label="描述"
              value={task.description}
              fallback="（无描述）"
            />
            <div className="grid grid-cols-2 gap-3">
              <DetailField
                label="状态"
                value={<TaskStatusBadge status={task.status} />}
              />
              <DetailField
                label="优先级"
                value={<TaskPriorityBadge priority={task.priority} />}
              />
              <DetailField
                label="截止时间"
                value={
                  task.due_at
                    ? format(new Date(task.due_at), "yyyy-MM-dd HH:mm")
                    : null
                }
                fallback="未设置"
                mono
              />
              <DetailField
                label="计划开始"
                value={
                  task.scheduled_at
                    ? format(new Date(task.scheduled_at), "yyyy-MM-dd HH:mm")
                    : null
                }
                fallback="未设置"
                mono
              />
              <DetailField
                label="预估时间"
                value={
                  task.estimated_minutes
                    ? `${task.estimated_minutes} 分钟`
                    : null
                }
                fallback="未设置"
              />
              <DetailField
                label="实际用时"
                value={
                  task.actual_minutes > 0
                    ? `${task.actual_minutes} 分钟`
                    : null
                }
                fallback="未记录"
              />
              <DetailField
                label="延期次数"
                value={
                  task.delay_count > 0 ? `${task.delay_count} 次` : "0 次"
                }
                mono
              />
              <DetailField
                label="完成时间"
                value={
                  task.completed_at
                    ? format(new Date(task.completed_at), "yyyy-MM-dd HH:mm")
                    : null
                }
                fallback="未完成"
                mono
              />
            </div>
            <DetailField
              label="失败原因"
              value={task.failure_reason}
              fallback="—"
            />
            <DetailField
              label="完成备注"
              value={task.completion_note}
              fallback="—"
            />
            <div className="grid grid-cols-2 gap-3">
              <DetailField
                label="创建时间"
                value={format(new Date(task.created_at), "yyyy-MM-dd HH:mm")}
                mono
              />
              <DetailField
                label="更新时间"
                value={format(new Date(task.updated_at), "yyyy-MM-dd HH:mm")}
                mono
              />
            </div>
            {(task.source_event_id || task.project_id || task.topic_id) && (
              <div className="grid grid-cols-1 gap-1 border-t border-border/20 pt-2 text-[10px] text-muted-foreground/60">
                {task.source_event_id && (
                  <div>
                    来源事件：<span className="font-mono">{task.source_event_id}</span>
                  </div>
                )}
                {task.project_id && (
                  <div>
                    所属项目：<span className="font-mono">{task.project_id}</span>
                  </div>
                )}
                {task.topic_id && (
                  <div>
                    所属主题：<span className="font-mono">{task.topic_id}</span>
                  </div>
                )}
              </div>
            )}

            {/* Pomodoro V1：任务维度番茄统计 */}
            <div className="rounded-lg border border-primary/15 bg-primary/[0.04] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-primary/80">
                <Timer className="h-3 w-3" />
                番茄记录
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground/70">完成番茄</span>
                  <span className="tabular-nums text-foreground/85">
                    {pomoLoading ? "—" : `${completedCount} 个`}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground/70">专注分钟</span>
                  <span className="tabular-nums text-foreground/85">
                    {pomoLoading ? "—" : `${focusMinutes} 分钟`}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground/70">总番茄</span>
                  <span className="tabular-nums text-muted-foreground/80">
                    {pomoLoading ? "—" : `${taskPomodoros.length} 次`}
                  </span>
                </div>
              </div>
              {/* 最近番茄记录 */}
              {!pomoLoading && taskPomodoros.length > 0 && (
                <div className="mt-2 flex flex-col gap-0.5 border-t border-border/20 pt-2">
                  {taskPomodoros.slice(0, 3).map((s) => {
                    const min = Math.round(s.actual_seconds / 60);
                    const statusZh =
                      s.status === "completed" ? "已完成" :
                      s.status === "abandoned" ? "已放弃" :
                      s.status === "interrupted" ? "已中断" :
                      s.status === "running" ? "进行中" :
                      s.status === "paused" ? "已暂停" : s.status;
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between text-[10px] text-muted-foreground/70"
                      >
                        <span className="truncate">
                          <span
                            className={cn(
                              "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                              s.status === "completed" && "bg-emerald-400/80",
                              s.status === "abandoned" && "bg-amber-400/80",
                              s.status === "interrupted" && "bg-rose-400/80",
                              s.status === "running" && "bg-primary/80",
                              s.status === "paused" && "bg-primary/40",
                            )}
                          />
                          {s.title}
                        </span>
                        <span className="ml-2 shrink-0 tabular-nums">
                          {s.status === "completed" ? `${min} 分钟` : statusZh}
                        </span>
                      </div>
                    );
                  })}
                  {taskPomodoros.length > 3 && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground/50">
                      +{taskPomodoros.length - 3} 条更早记录
                    </div>
                  )}
                </div>
              )}
              {!pomoLoading && taskPomodoros.length === 0 && (
                <div className="mt-2 flex items-center gap-1.5 border-t border-border/20 pt-2 text-[10px] text-muted-foreground/50">
                  <Timer className="h-3 w-3" />
                  点击上方「开始番茄」为这个任务投入一段专注时间
                </div>
              )}
            </div>
          </div>
        )}

        {/* 操作行 - 必须阻止冒泡，避免触发卡片 onClick */}
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {task.status !== "done" && task.status !== "dropped" && (
            <ActionButton
              size="sm"
              variant="default"
              onClick={async () => {
                const result = await markDone(task.id, { completionNote: null });
                if (result.ok) {
                  toast.success("任务已完成", { description: result.data.title });
                  onChange();
                } else {
                  toast.error("完成失败", { description: result.error });
                }
              }}
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              完成
            </ActionButton>
          )}

          {task.status !== "done" && task.status !== "dropped" && (
            <ActionButton
              size="sm"
              variant="outline"
              onClick={onDelay}
            >
              <Clock className="mr-1 h-3 w-3" />
              延期
            </ActionButton>
          )}

          {task.status !== "done" && task.status !== "dropped" && (
            <ActionButton
              size="sm"
              variant="outline"
              onClick={onSnooze}
            >
              <BellRing className="mr-1 h-3 w-3" />
              稍后提醒
            </ActionButton>
          )}

          {task.status === "inbox" && (
            <ActionButton
              size="sm"
              variant="outline"
              onClick={onActivate}
            >
              <Plus className="mr-1 h-3 w-3" />
              开始推进
            </ActionButton>
          )}

          {task.status !== "done" && task.status !== "dropped" && (
            <ActionButton
              size="sm"
              variant="outline"
              onClick={handleStartPomodoro}
            >
              <Timer className="mr-1 h-3 w-3" />
              {pomoStarting ? "启动中..." : "开始番茄"}
            </ActionButton>
          )}

          <span className="ml-auto text-[9px] text-muted-foreground/50">
            创建于 {format(new Date(task.created_at), "MM-dd HH:mm")}
          </span>
        </div>
      </div>
    </HarshHighlight>
  );
}

// ---------------------------------------------------------------------------
// 详情字段组件
// ---------------------------------------------------------------------------

function DetailField({
  label,
  value,
  fallback,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  fallback?: string;
  mono?: boolean;
}) {
  const hasValue =
    value !== null &&
    value !== undefined &&
    value !== "" &&
    !(typeof value === "string" && value.trim() === "");

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground/70">
        {label}
      </span>
      <span
        className={cn(
          "text-xs",
          hasValue ? "text-foreground/85" : "text-muted-foreground/40",
          mono && "tabular-nums",
        )}
      >
        {hasValue ? value : fallback ?? "—"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 简易 Button 包装（lucide icon + 文字）
// ---------------------------------------------------------------------------

function ActionButton({
  children,
  onClick,
  variant,
  size,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "default" | "outline" | "ghost";
  size: "sm" | "icon";
}) {
  return (
    <Button variant={variant} size={size} onClick={onClick} className="h-7 text-xs">
      {children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// 时间格式化辅助（CreateTaskDialog 用）
// ---------------------------------------------------------------------------

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
