/**
 * Tasks Page
 *
 * Phase 6 改造：
 * - 接入真实 tasks 数据（不再占位）
 * - 7 个 tabs：今日 / Inbox / Active / Delayed / Done / Archived / 全部
 * - 任务卡片支持：完成 / 延期 / 激活 / 稍后提醒 操作
 * - 显示 delay_count（INV-6: 单调递增）
 * - 时间显示用本地时区
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
import type { TaskRow, ReminderRow } from "@/types/db";
import {
  listDueToday,
  listInbox,
  listActive,
  listDelayed,
  listDone,
  listArchived,
  listAllNotDone,
} from "@/lib/repositories/task-repo";
import { listActiveByTaskId } from "@/lib/repositories/reminder-repo";
import {
  markDone,
  delayTask,
  activateTask,
  snoozeReminder,
} from "@/lib/supervision/task-ops";
import { nowIso } from "@/lib/id";
import { format } from "date-fns";
import { toast } from "sonner";

type TaskTab =
  | "today"
  | "inbox"
  | "active"
  | "delayed"
  | "done"
  | "archived"
  | "all";

export function TasksPage() {
  const [tab, setTab] = useState<TaskTab>("today");
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <PagePlaceholder
      title="Tasks"
      description="全部任务 · 按状态筛选 · 监督执行"
      icon={CheckSquare}
      emptyHint="还没有任务。说一句话，烛照会帮你拆。"
      action={
        <Button variant="outline" onClick={handleRefresh} disabled={loading}>
          <Plus className="mr-1.5 h-4 w-4" />
          刷新
        </Button>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TaskTab)}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="today">今日</TabsTrigger>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
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
          {tab === "inbox" && "Inbox 为空"}
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
                onChange={handleRefresh}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </PagePlaceholder>
  );
}

// ---------------------------------------------------------------------------
// 任务卡片（含操作按钮）
// ---------------------------------------------------------------------------

function TaskCard({
  task,
  onChange,
}: {
  task: TaskRow;
  onChange: () => void;
}) {
  const isHarsh = task.delay_count >= 2;
  const isOverdue =
    task.due_at !== null &&
    task.due_at < nowIso() &&
    task.status !== "done" &&
    task.status !== "dropped";

  return (
    <HarshHighlight delayCount={task.delay_count}>
      <div
        className={`rounded-lg border p-3 transition-colors ${
          isOverdue
            ? "border-rose-600/40 bg-rose-600/5"
            : isHarsh
              ? "border-rose-600/30"
              : "border-border bg-card hover:bg-accent/30"
        }`}
      >
        {/* 标题行 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium truncate">
              {task.title}
            </h3>
            {task.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <TaskStatusBadge status={task.status} />
            <TaskPriorityBadge priority={task.priority} />
          </div>
        </div>

        {/* 元信息行 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {task.due_at && (
            <span
              className={`flex items-center gap-0.5 ${
                isOverdue ? "text-rose-400 font-medium" : ""
              }`}
            >
              <CalendarClock className="h-2.5 w-2.5" />
              {format(new Date(task.due_at), "MM-dd HH:mm")}
              {isOverdue && " · 逾期"}
            </span>
          )}
          {task.delay_count > 0 && (
            <span
              className={`flex items-center gap-0.5 ${
                isHarsh ? "text-rose-400 font-medium" : "text-orange-400"
              }`}
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
            <span className="flex items-center gap-0.5 text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              完成：{format(new Date(task.completed_at), "MM-dd HH:mm")}
            </span>
          )}
        </div>

        {/* 操作行 */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
          {task.status !== "done" && task.status !== "dropped" && (
            <ActionButton
              size="sm"
              variant="default"
              onClick={() => handleMarkDone(task.id, onChange)}
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              完成
            </ActionButton>
          )}

          {task.status !== "done" && task.status !== "dropped" && (
            <ActionButton
              size="sm"
              variant="outline"
              onClick={() => handleDelay(task, onChange)}
            >
              <Clock className="mr-1 h-3 w-3" />
              延期
            </ActionButton>
          )}

          {task.status !== "done" && task.status !== "dropped" && (
            <ActionButton
              size="sm"
              variant="outline"
              onClick={() => handleSnooze(task, onChange)}
            >
              <BellRing className="mr-1 h-3 w-3" />
              稍后
            </ActionButton>
          )}

          {task.status === "inbox" && (
            <ActionButton
              size="sm"
              variant="outline"
              onClick={() => handleActivate(task, onChange)}
            >
              <Plus className="mr-1 h-3 w-3" />
              激活
            </ActionButton>
          )}

          <span className="ml-auto text-[9px] text-muted-foreground/50">
            创建：{format(new Date(task.created_at), "MM-dd HH:mm")}
          </span>
        </div>
      </div>
    </HarshHighlight>
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
// 操作处理
// ---------------------------------------------------------------------------

async function handleMarkDone(
  taskId: string,
  onChange: () => void,
): Promise<void> {
  const result = await markDone(taskId, {
    completionNote: null,
  });
  if (result.ok) {
    toast.success("任务已完成", {
      description: result.data.title,
    });
    onChange();
  } else {
    toast.error("完成失败", { description: result.error });
  }
}

async function handleDelay(
  task: TaskRow,
  onChange: () => void,
): Promise<void> {
  // 简易交互：让用户输入新的 due_at（datetime-local 格式）
  // V0 简化策略：Phase 9 改为 Dialog 组件
  const defaultDue = task.due_at
    ? toDatetimeLocal(task.due_at)
    : toDatetimeLocal(nowIso());
  const input = window.prompt(
    `延期任务「${task.title}」\n\n请输入新的截止时间（格式：YYYY-MM-DDTHH:MM）\n当前已延期 ${task.delay_count} 次`,
    defaultDue,
  );

  if (input === null) return; // 取消

  const newDueAt = fromDatetimeLocal(input);
  if (!newDueAt) {
    toast.error("时间格式错误", {
      description: "请使用 YYYY-MM-DDTHH:MM 格式，例如 2026-07-05T15:30",
    });
    return;
  }

  const reasonInput = window.prompt(
    `延期原因（可选，留空也行）：`,
    task.failure_reason ?? "",
  );

  const result = await delayTask(task.id, {
    newDueAt,
    reason: reasonInput || null,
    newStatus: "delayed",
  });

  if (result.ok) {
    toast.success("任务已延期", {
      description: `"${task.title}" 已延期到 ${format(new Date(newDueAt), "MM-dd HH:mm")}（累计 ${result.data.task.delay_count} 次）`,
    });
    onChange();
  } else {
    toast.error("延期失败", { description: result.error });
  }
}

async function handleSnooze(
  task: TaskRow,
  onChange: () => void,
): Promise<void> {
  // 找该任务的 pending/fired reminder
  const reminders = await listActiveByTaskId(task.id);
  if (reminders.length === 0) {
    toast.warning("无活跃 reminder", {
      description: "此任务没有待触发的 reminder，可使用『延期』创建新的。",
    });
    return;
  }

  // 取最近一条
  const reminder: ReminderRow = reminders[0];

  // 默认稍后 1 小时
  const defaultAt = new Date(Date.now() + 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const input = window.prompt(
    `稍后提醒任务「${task.title}」\n\n请输入稍后时间（格式：YYYY-MM-DDTHH:MM）\n默认 +1 小时`,
    defaultAt,
  );

  if (input === null) return;

  const newRemindAt = fromDatetimeLocal(input);
  if (!newRemindAt) {
    toast.error("时间格式错误", {
      description: "请使用 YYYY-MM-DDTHH:MM 格式",
    });
    return;
  }

  const result = await snoozeReminder(reminder.id, newRemindAt);
  if (result.ok) {
    toast.success("已稍后提醒", {
      description: `${format(new Date(newRemindAt), "MM-dd HH:mm")} 再追问`,
    });
    onChange();
  } else {
    toast.error("稍后失败", { description: result.error });
  }
}

async function handleActivate(
  task: TaskRow,
  onChange: () => void,
): Promise<void> {
  const defaultDue = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const input = window.prompt(
    `激活任务「${task.title}」\n\n请输入截止时间（格式：YYYY-MM-DDTHH:MM）\n默认明天此时`,
    defaultDue,
  );

  if (input === null) return;

  const dueAt = fromDatetimeLocal(input);
  if (!dueAt) {
    toast.error("时间格式错误", {
      description: "请使用 YYYY-MM-DDTHH:MM 格式",
    });
    return;
  }

  const result = await activateTask(task.id, { dueAt });
  if (result.ok) {
    toast.success("任务已激活", {
      description: `"${task.title}" 已排期到 ${format(new Date(dueAt), "MM-dd HH:mm")}`,
    });
    onChange();
  } else {
    toast.error("激活失败", { description: result.error });
  }
}

// ---------------------------------------------------------------------------
// 时间格式化辅助
// ---------------------------------------------------------------------------

/**
 * ISO → datetime-local 输入框格式（YYYY-MM-DDTHH:MM，本地时区）
 */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

/**
 * datetime-local 输入框值 → ISO 字符串
 * 输入：2026-07-05T15:30 → 输出：本地时区对应的 ISO（UTC）
 */
function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  // 解析 YYYY-MM-DDTHH:MM
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min] = match;
  const localDate = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
  if (isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}
