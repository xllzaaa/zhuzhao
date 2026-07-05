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
  Sparkles,
  RefreshCw,
  type LucideIcon,
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
import { generateDailySummary } from "@/lib/daily-summary/generator";
import { parseSections } from "@/lib/repositories/review-repo";
import type { EventRow, TaskRow, JournalEntryRow, IdeaRow, ReminderRow, ReviewRow } from "@/types/db";
import { format } from "date-fns";
import { toast } from "sonner";

/** 数据来源 → 中文标签 */
const SOURCE_LABEL: Record<string, string> = {
  chat: "对话",
  quick_input: "快速记录",
  journal: "日记",
  reminder: "提醒",
  system: "系统",
};

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const reloadData = () =>
    loadDashboardData()
      .then(setData)
      .catch((err) => setError(err?.message ?? String(err)));

  useEffect(() => {
    reloadData();
  }, []);

  const handleGenerateSummary = async () => {
    if (generatingSummary) return;
    setGeneratingSummary(true);
    try {
      const result = await generateDailySummary();
      if (result.ok) {
        const source = result.source === "llm" ? "AI 引擎" : "本地模板";
        toast.success("今日总结已生成", {
          description: `来源：${source}${result.warnings.length > 0 ? `（${result.warnings.length} 个警告）` : ""}`,
        });
        await reloadData();
      } else {
        toast.error("生成失败", {
          description: result.error ?? "未知错误",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("生成异常", { description: msg });
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleQuickSubmit = async () => {
    const trimmed = quickInput.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const event = await createEvent({
        source: "quick_input",
        raw_content: trimmed,
        event_type: "user_input",
      });
      toast.success("已记录", { description: "输入已保存到收集箱" });
      setQuickInput("");
      reloadData();
      runIntake(event, null)
        .then((result) => {
          reloadData();
          if (result.success) {
            toast.success("已整理", { description: result.summary });
          } else {
            toast.warning("整理未完成", { description: result.summary });
          }
        })
        .catch(() => {
          // runIntake 内部已 try/catch
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
      title="首页"
      description="照见今天要推进的事"
      icon={LayoutDashboard}
      emptyHint="这里空着，是因为你还没有输入今天的第一件事。"
    >
      {/* 快速输入框（吸顶） */}
      <div className="mb-4 sticky top-0 z-10 -mx-6 -mt-6 bg-background/80 px-6 py-3 backdrop-blur border-b border-border/50">
        <div className="flex gap-2">
          <Input
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            placeholder="想到什么就写什么，烛照会帮你判断要做什么（⌘+I 全局唤起）"
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

      {/* 顶部状态概览（Apple-like 小提示，不是警报） */}
      {data && <StatusOverview data={data} />}

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
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
        <div className="space-y-4">
          {/* ===== 核心区（4 张） ===== */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* 今日最重要 */}
            <Card className="p-4 md:col-span-1">
              <SectionTitle icon={Zap} label="今日最重要" />
              {data.topOfToday ? (
                <TaskCard task={data.topOfToday} highlight />
              ) : (
                <EmptyHint icon={Zap} text="暂无高优先级任务" />
              )}
            </Card>

            {/* 今日到期 */}
            <Card className="p-4">
              <SectionTitle
                icon={Clock}
                label={`今日到期（${data.dueToday.length}）`}
              />
              <ScrollArea className="h-36">
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

            {/* 烛照监督提醒（柔化，不再用 destructive 边框） */}
            <Card className="border-amber-500/30 bg-amber-500/[0.04] p-4">
              <SectionTitle
                icon={AlertTriangle}
                label={`烛照监督提醒（${data.harsh.length}）`}
                tone="warning"
              />
              <ScrollArea className="h-36">
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

            {/* 今日总结（跨 3 列） */}
            <Card className="border-primary/30 p-4 md:col-span-3">
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle icon={Sparkles} label="今日总结" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? (
                    <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-3 w-3" />
                  )}
                  {generatingSummary
                    ? "生成中..."
                    : data.todaySummary
                      ? "重新生成"
                      : "生成今日总结"}
                </Button>
              </div>
              {generatingSummary ? (
                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  正在生成今日总结...
                </div>
              ) : data.todaySummary ? (
                <DailySummaryCard review={data.todaySummary} />
              ) : (
                <EmptyHint icon={ClipboardList} text="今日未生成总结" />
              )}
            </Card>
          </div>

          {/* ===== 次级区（监督信息，保留全部模块） ===== */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* 已逾期任务 */}
            <Card className="border-rose-500/25 p-4">
              <SectionTitle
                icon={Calendar}
                label={`已逾期任务（${data.overdue.length}）`}
                tone="danger"
              />
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

            {/* 高延期任务 */}
            <Card className="border-orange-500/25 p-4">
              <SectionTitle
                icon={TrendingUp}
                label={`高延期任务（${data.highDelay.length}）`}
                tone="warning"
              />
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

            {/* 最近触发的提醒 */}
            <Card className="p-4">
              <SectionTitle
                icon={BellRing}
                label={`最近触发提醒（${data.recentlyTriggeredReminders.length}）`}
              />
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
              <SectionTitle icon={CheckCircle2} label={`进行中（${data.doing.length}）`} />
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
              <SectionTitle
                icon={Clock}
                label={`已延期任务（${data.delayed.length}）`}
                tone="warning"
              />
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
              <SectionTitle
                icon={Zap}
                label={`今日输入（${data.recentEvents.length}）`}
              />
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
              <SectionTitle icon={FileText} label="最近日记" />
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
              <SectionTitle icon={Lightbulb} label="最近灵感" />
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
          </div>
        </div>
      )}
    </PagePlaceholder>
  );
}

// =========================================================================
// 顶部状态概览（柔和 Apple 风格）
// =========================================================================

function StatusOverview({ data }: { data: DashboardData }) {
  const dueCount = data.dueToday.length;
  const overdueCount = data.overdue.length;
  const highDelayCount = data.highDelay.length;
  const inputCount = data.recentEvents.length;
  const topTitle = data.topOfToday?.title;

  // 文案构建
  let message: string;
  if (dueCount === 0 && overdueCount === 0 && highDelayCount === 0) {
    if (inputCount === 0) {
      message = "今天还很安静，可以先记录一个最重要的任务。";
    } else {
      message = "今天暂无到期或逾期任务，节奏不错，继续推进。";
    }
  } else {
    const parts: string[] = [];
    if (dueCount > 0) parts.push(`今天有 ${dueCount} 件任务待推进`);
    if (overdueCount > 0) parts.push(`${overdueCount} 件已逾期`);
    if (highDelayCount > 0) parts.push(`${highDelayCount} 件高延期`);
    message = parts.join("，") + "。";
    if (topTitle) {
      message += `建议先处理「${topTitle}」。`;
    }
  }

  // 风险等级决定左侧细色条颜色（柔和）
  const level: "calm" | "warn" = overdueCount > 0 || highDelayCount > 0 ? "warn" : "calm";
  const accentBar = level === "warn" ? "bg-amber-500/70" : "bg-primary/60";

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-border/40 bg-muted/30 p-3.5">
      <span className={`mt-0.5 h-4 w-1 shrink-0 rounded-full ${accentBar}`} />
      <div className="flex-1">
        <p className="text-[13px] leading-relaxed text-foreground/90">{message}</p>
      </div>
    </div>
  );
}

// =========================================================================
// 通用子组件
// =========================================================================

/** 区块小标题（柔和、左对齐、icon + 中文） */
function SectionTitle({
  icon: Icon,
  label,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  tone?: "default" | "warning" | "danger";
}) {
  const iconColor =
    tone === "warning"
      ? "text-amber-400"
      : tone === "danger"
        ? "text-rose-400"
        : "text-muted-foreground";
  return (
    <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className={`h-3 w-3 ${iconColor}`} />
      <span className="text-foreground/80">{label}</span>
    </h3>
  );
}

/** 任务卡片（用于今日最重要） */
function TaskCard({ task, highlight }: { task: TaskRow; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 tz-transition ${
        highlight ? "border-primary/30 bg-primary/[0.04]" : "border-border/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{task.title}</span>
        <TaskPriorityBadge priority={task.priority} />
      </div>
      {task.description && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {task.description}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2 text-[10px] text-muted-foreground">
        <TaskStatusBadge status={task.status} />
        {task.due_at && (
          <span className="flex items-center gap-0.5">
            <Calendar className="h-2.5 w-2.5" />
            {format(new Date(task.due_at), "HH:mm")}
          </span>
        )}
        {task.delay_count > 0 && (
          <span className="text-amber-400/90">延期 {task.delay_count} 次</span>
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
  // 风险用左侧细色条表达，不再用整块红边框
  const sideBar = overdue
    ? "bg-rose-500/60"
    : highlightDelay && task.delay_count >= 2
      ? "bg-rose-500/50"
      : highlightDelay && task.delay_count >= 1
        ? "bg-amber-500/60"
        : "bg-transparent";

  return (
    <div className="relative rounded-lg border border-border/40 bg-card/60 px-2.5 py-1.5 hover:bg-accent/40 tz-transition">
      {sideBar !== "bg-transparent" && (
        <span className={`absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-r-full ${sideBar}`} />
      )}
      <div className="flex items-center justify-between gap-1 pl-1.5">
        <span className="truncate text-xs">{task.title}</span>
        <TaskStatusBadge status={task.status} />
      </div>
      <div className="mt-1 flex items-center gap-2 pl-1.5 text-[10px] text-muted-foreground/80">
        {task.due_at && (
          <span className={overdue ? "text-rose-400/90" : ""}>
            {format(new Date(task.due_at), "MM-dd HH:mm")}
            {overdue && " · 逾期"}
          </span>
        )}
        {task.delay_count > 0 && (
          <span
            className={
              task.delay_count >= 2 ? "text-rose-400/90" : "text-amber-400/90"
            }
          >
            延期 {task.delay_count}
          </span>
        )}
      </div>
    </div>
  );
}

/** Reminder 迷你卡片 */
function ReminderMiniCard({ reminder }: { reminder: ReminderRow }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/60 px-2.5 py-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/80">
        <ReminderStatusLabel status={reminder.status} />
        <span>{format(new Date(reminder.remind_at), "MM-dd HH:mm")}</span>
      </div>
      {reminder.message && (
        <p className="mt-0.5 truncate text-xs">{reminder.message}</p>
      )}
    </div>
  );
}

/** Reminder 状态中文标签（弱化） */
function ReminderStatusLabel({ status }: { status: ReminderRow["status"] }) {
  const label: Record<ReminderRow["status"], string> = {
    pending: "等待",
    fired: "已触发",
    snoozed: "已稍后",
    resolved: "已解决",
    cancelled: "已取消",
  };
  const color: Record<ReminderRow["status"], string> = {
    pending: "text-zinc-400",
    fired: "text-amber-400",
    snoozed: "text-sky-400",
    resolved: "text-emerald-400",
    cancelled: "text-zinc-500",
  };
  return <span className={color[status] ?? "text-muted-foreground"}>{label[status]}</span>;
}

/** Event 迷你卡片 */
function EventMiniCard({ event }: { event: EventRow }) {
  const sourceLabel = SOURCE_LABEL[event.source] ?? event.source;
  return (
    <div className="rounded-lg border border-border/40 bg-card/60 px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground/80">
        <span>{sourceLabel}</span>
        <span>{format(new Date(event.created_at), "HH:mm")}</span>
      </div>
      <p className="mt-0.5 truncate text-xs">{event.raw_content}</p>
    </div>
  );
}

/** 日记迷你卡片 */
function JournalMiniCard({ journal }: { journal: JournalEntryRow }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/60 px-2.5 py-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/80">
        <span>{journal.entry_date}</span>
        {journal.mood && <span className="text-xs">{journal.mood}</span>}
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed">{journal.raw_content}</p>
    </div>
  );
}

/** 灵感迷你卡片 */
function IdeaMiniCard({ idea }: { idea: IdeaRow }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/60 px-2.5 py-1.5">
      <div className="truncate text-xs font-medium">💡 {idea.title}</div>
      {idea.summary && (
        <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground/80">
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
      <Icon className="h-4 w-4" strokeWidth={1.5} />
      <span>{text}</span>
    </div>
  );
}

/** Phase 7: 今日总结迷你卡片 */
function DailySummaryCard({ review }: { review: ReviewRow }) {
  const sections = parseSections(review.sections);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="whitespace-pre-wrap break-words text-xs text-foreground/90 line-clamp-6 leading-relaxed">
        {review.raw_content}
      </div>
      {sections && (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          {sections.wins && sections.wins.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2">
              <div className="font-medium text-emerald-400">做成（{sections.wins.length}）</div>
              <ul className="ml-3 list-disc text-muted-foreground line-clamp-3 leading-relaxed">
                {sections.wins.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {sections.delays && sections.delays.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2">
              <div className="font-medium text-amber-400">拖延（{sections.delays.length}）</div>
              <ul className="ml-3 list-disc text-muted-foreground line-clamp-3 leading-relaxed">
                {sections.delays.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {sections.topNext && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-2">
              <div className="font-medium text-sky-400">明天最重要</div>
              <p className="text-muted-foreground line-clamp-3 leading-relaxed">{sections.topNext}</p>
            </div>
          )}
          {sections.improvement && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-2">
              <div className="font-medium text-violet-400">改进</div>
              <p className="text-muted-foreground line-clamp-3 leading-relaxed">{sections.improvement}</p>
            </div>
          )}
        </div>
      )}
      <div className="text-[9px] text-muted-foreground/60">
        生成于 {format(new Date(review.created_at), "yyyy-MM-dd HH:mm")}
      </div>
    </div>
  );
}
