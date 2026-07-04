import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Zap,
  FileText,
  Lightbulb,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  Clock,
  Calendar,
  BellRing,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TaskStatusBadge,
  TaskPriorityBadge,
  HarshHighlight,
} from "@/components/badges/StatusBadges";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { loadDashboardData, type DashboardData } from "@/lib/repositories/dashboard-queries";
import { createEvent } from "@/lib/repositories/event-repo";
import { runIntake } from "@/lib/intake/run-intake";
import type { EventRow, TaskRow, JournalEntryRow, IdeaRow, ReminderRow } from "@/types/db";
import { format } from "date-fns";
import { toast } from "sonner";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reloadData = () =>
    loadDashboardData()
      .then(setData)
      .catch((err) => setError(err?.message ?? String(err)));

  useEffect(() => {
    reloadData();
  }, []);

  const handleQuickSubmit = async () => {
    const trimmed = quickInput.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      // 1. 先落 Event（用户输入永不丢）
      const event = await createEvent({
        source: "quick_input",
        raw_content: trimmed,
        event_type: "user_input",
      });
      toast.success("已记录", { description: "输入已保存到 Inbox" });
      setQuickInput("");
      // 2. 刷新 Dashboard（让用户看到新 Event）
      reloadData();
      // 3. 异步触发 LLM Intake（不阻塞 UI）
      //    Intake 完成后再刷新一次 Dashboard，让自动创建的 Task/Journal/Idea 可见
      runIntake(event, null)
        .then((result) => {
          reloadData();
          if (result.success) {
            toast.success("Intake 完成", { description: result.summary });
          } else {
            toast.warning("Intake 未完成", { description: result.summary });
          }
        })
        .catch(() => {
          // runIntake 内部已 try/catch，这里仅兜底
        });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("保存失败", { description: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PagePlaceholder
      title="Dashboard"
      description="每日作战室 · 照见今日状态"
      icon={LayoutDashboard}
      emptyHint="这里空着，是因为你还没有输入今天的第一件事。"
    >
      {/* 快速输入框（吸顶） */}
      <div className="mb-6 sticky top-0 z-10 -mx-6 -mt-6 bg-background/80 px-6 py-4 backdrop-blur border-b border-border">
        <div className="flex gap-2">
          <Input
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="⚡ 快速输入... (⌘+I 全局唤起)"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleQuickSubmit();
              }
            }}
          />
          <Button onClick={handleQuickSubmit} disabled={submitting || !quickInput.trim()}>
            <Zap className="mr-1.5 h-4 w-4" />
            {submitting ? "提交中..." : "提交"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          加载失败：{error}
        </div>
      )}

      {!data && !error && (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          加载中...
        </div>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          {/* 今日最重要任务 */}
          <Card className="p-4 md:col-span-1">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              今日最重要
            </h3>
            {data.topOfToday ? (
              <TaskCard task={data.topOfToday} highlight />
            ) : (
              <EmptyHint icon={Zap} text="暂无高优先级任务" />
            )}
          </Card>

          {/* 今日到期 */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              今日到期（{data.dueToday.length}）
            </h3>
            <ScrollArea className="h-32">
              {data.dueToday.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.dueToday.map((t) => (
                    <TaskMiniCard key={t.id} task={t} />
                  ))}
                </div>
              ) : (
                <EmptyHint icon={Clock} text="今日无到期任务" />
              )}
            </ScrollArea>
          </Card>

          {/* 烛照监督提醒 */}
          <Card className="border-destructive/30 p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3 w-3" />
              烛照监督提醒（{data.harsh.length}）
            </h3>
            <ScrollArea className="h-32">
              {data.harsh.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.harsh.map((t) => (
                    <HarshHighlight key={t.id} delayCount={t.delay_count}>
                      <TaskMiniCard task={t} />
                    </HarshHighlight>
                  ))}
                </div>
              ) : (
                <EmptyHint icon={AlertTriangle} text="暂无逾期重点" />
              )}
            </ScrollArea>
          </Card>

          {/* Phase 6: 已逾期任务（due_at < now） */}
          <Card className="border-rose-600/30 p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-400">
              <Calendar className="h-3 w-3" />
              已逾期任务（{data.overdue.length}）
            </h3>
            <ScrollArea className="h-32">
              {data.overdue.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.overdue.map((t) => (
                    <TaskMiniCard key={t.id} task={t} overdue />
                  ))}
                </div>
              ) : (
                <EmptyHint icon={Calendar} text="暂无逾期" />
              )}
            </ScrollArea>
          </Card>

          {/* Phase 6: 高 delay_count 任务 */}
          <Card className="border-orange-500/30 p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-orange-400">
              <TrendingUp className="h-3 w-3" />
              高延期任务（{data.highDelay.length}）
            </h3>
            <ScrollArea className="h-32">
              {data.highDelay.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.highDelay.map((t) => (
                    <TaskMiniCard key={t.id} task={t} highlightDelay />
                  ))}
                </div>
              ) : (
                <EmptyHint icon={TrendingUp} text="暂无延期记录" />
              )}
            </ScrollArea>
          </Card>

          {/* Phase 6: 最近触发的提醒 */}
          <Card className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <BellRing className="h-3 w-3" />
              最近触发的提醒（{data.recentlyTriggeredReminders.length}）
            </h3>
            <ScrollArea className="h-32">
              {data.recentlyTriggeredReminders.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {data.recentlyTriggeredReminders.map((r) => (
                    <ReminderMiniCard key={r.id} reminder={r} />
                  ))}
                </div>
              ) : (
                <EmptyHint icon={BellRing} text="暂无触发记录" />
              )}
            </ScrollArea>
          </Card>

          {/* 进行中 */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              进行中（{data.doing.length}）
            </h3>
            <ScrollArea className="h-32">
              {data.doing.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.doing.map((t) => (
                    <TaskMiniCard key={t.id} task={t} />
                  ))}
                </div>
              ) : (
                <EmptyHint icon={CheckCircle2} text="暂无进行中任务" />
              )}
            </ScrollArea>
          </Card>

          {/* 延期任务 */}
          <Card className="border-orange-500/20 p-4">
            <h3 className="mb-2 text-xs font-medium text-orange-400">
              延期任务（{data.delayed.length}）
            </h3>
            <ScrollArea className="h-32">
              {data.delayed.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.delayed.map((t) => (
                    <TaskMiniCard key={t.id} task={t} />
                  ))}
                </div>
              ) : (
                <EmptyHint icon={Clock} text="暂无延期任务" />
              )}
            </ScrollArea>
          </Card>

          {/* 今日输入 */}
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              今日输入（{data.recentEvents.length}）
            </h3>
            <ScrollArea className="h-32">
              {data.recentEvents.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {data.recentEvents.map((e) => (
                    <EventMiniCard key={e.id} event={e} />
                  ))}
                </div>
              ) : (
                <EmptyHint icon={Zap} text="还没有输入" />
              )}
            </ScrollArea>
          </Card>

          {/* 最近日记 */}
          <Card className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="h-3 w-3" />
              最近日记
            </h3>
            <ScrollArea className="h-32">
              {data.recentJournals.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.recentJournals.map((j) => (
                    <JournalMiniCard key={j.id} journal={j} />
                  ))}
                </div>
              ) : (
                <EmptyHint icon={FileText} text="还没有日记" />
              )}
            </ScrollArea>
          </Card>

          {/* 最近灵感 */}
          <Card className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Lightbulb className="h-3 w-3" />
              最近灵感
            </h3>
            <ScrollArea className="h-32">
              {data.recentIdeas.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {data.recentIdeas.map((i) => (
                    <IdeaMiniCard key={i.id} idea={i} />
                  ))}
                </div>
              ) : (
                <EmptyHint icon={Lightbulb} text="还没有灵感" />
              )}
            </ScrollArea>
          </Card>

          {/* 每日总结入口 */}
          <Card className="p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ClipboardList className="h-3 w-3" />
              每日总结
            </h3>
            <EmptyHint icon={ClipboardList} text="今日未生成总结" />
          </Card>
        </div>
      )}
    </PagePlaceholder>
  );
}

/** 任务卡片（用于今日最重要） */
function TaskCard({ task, highlight }: { task: TaskRow; highlight?: boolean }) {
  return (
    <div
      className={`rounded-md border p-2.5 ${
        highlight ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium">{task.title}</span>
        <TaskPriorityBadge priority={task.priority} />
      </div>
      {task.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {task.description}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <TaskStatusBadge status={task.status} />
        {task.due_at && (
          <span className="flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" />
            {format(new Date(task.due_at), "HH:mm")}
          </span>
        )}
        {task.delay_count > 0 && (
          <span className="text-orange-400">
            延期 {task.delay_count} 次
          </span>
        )}
      </div>
    </div>
  );
}

/** 任务迷你卡片 */
function TaskMiniCard({
  task,
  overdue = false,
  highlightDelay = false,
}: {
  task: TaskRow;
  overdue?: boolean;
  highlightDelay?: boolean;
}) {
  return (
    <div
      className={`rounded border px-2 py-1.5 hover:bg-accent/50 ${
        overdue
          ? "border-rose-600/40 bg-rose-600/5"
          : highlightDelay && task.delay_count >= 2
            ? "border-rose-600/30"
            : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs">{task.title}</span>
        <TaskStatusBadge status={task.status} />
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
        {task.due_at && (
          <span className={overdue ? "text-rose-400" : ""}>
            {format(new Date(task.due_at), "MM-dd HH:mm")}
            {overdue && " · 逾期"}
          </span>
        )}
        {task.delay_count > 0 && (
          <span
            className={
              task.delay_count >= 2 ? "text-rose-400" : "text-orange-400"
            }
          >
            延期 {task.delay_count}
          </span>
        )}
      </div>
    </div>
  );
}

/** Reminder 迷你卡片（Phase 6） */
function ReminderMiniCard({
  reminder,
}: {
  reminder: ReminderRow;
}) {
  const statusColor: Record<string, string> = {
    pending: "text-zinc-400",
    fired: "text-amber-400",
    snoozed: "text-sky-400",
    resolved: "text-emerald-400",
    cancelled: "text-zinc-500",
  };
  return (
    <div className="rounded border border-border px-2 py-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className={statusColor[reminder.status] ?? "text-muted-foreground"}>
          {reminder.status}
        </span>
        <span>{format(new Date(reminder.remind_at), "MM-dd HH:mm")}</span>
      </div>
      {reminder.message && (
        <p className="mt-0.5 truncate text-xs">{reminder.message}</p>
      )}
    </div>
  );
}

/** Event 迷你卡片 */
function EventMiniCard({ event }: { event: EventRow }) {
  return (
    <div className="rounded border border-border px-2 py-1">
      <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
        <span>{event.source}</span>
        <span>{format(new Date(event.created_at), "HH:mm")}</span>
      </div>
      <p className="mt-0.5 truncate text-xs">{event.raw_content}</p>
    </div>
  );
}

/** 日记迷你卡片 */
function JournalMiniCard({ journal }: { journal: JournalEntryRow }) {
  return (
    <div className="rounded border border-border px-2 py-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{journal.entry_date}</span>
        <span className="text-xs">{journal.mood}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs">{journal.raw_content}</p>
    </div>
  );
}

/** 灵感迷你卡片 */
function IdeaMiniCard({ idea }: { idea: IdeaRow }) {
  return (
    <div className="rounded border border-border px-2 py-1.5">
      <div className="truncate text-xs font-medium">💡 {idea.title}</div>
      {idea.summary && (
        <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
          {idea.summary}
        </p>
      )}
    </div>
  );
}

/** 空状态提示 */
function EmptyHint({
  icon: Icon,
  text,
}: {
  icon: typeof Zap;
  text: string;
}) {
  return (
    <div className="flex h-full min-h-20 flex-col items-center justify-center gap-1 text-xs text-muted-foreground/50">
      <Icon className="h-4 w-4" />
      <span>{text}</span>
    </div>
  );
}
