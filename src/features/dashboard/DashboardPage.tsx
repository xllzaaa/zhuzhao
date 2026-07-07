import { useEffect, useState, type ReactNode } from "react";
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
  Sparkles,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TaskStatusBadge,
  TaskPriorityBadge,
} from "@/components/badges/StatusBadges";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { HeroPanel } from "@/components/ui/hero-panel";
import { SoftCard } from "@/components/ui/soft-card";
import { MetricPill } from "@/components/ui/metric-pill";
import { SectionHeader } from "@/components/ui/section-header";
import { CompactRow } from "@/components/ui/compact-row";
import { loadDashboardData, type DashboardData } from "@/lib/repositories/dashboard-queries";
import { createEvent } from "@/lib/repositories/event-repo";
import { runIntake } from "@/lib/intake/run-intake";
import { generateDailySummary } from "@/lib/daily-summary/generator";
import { parseSections } from "@/lib/repositories/review-repo";
import type { EventRow, TaskRow, JournalEntryRow, IdeaRow, ReminderRow, ReviewRow } from "@/types/db";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";

/** 数据来源 → 中文标签 */
const SOURCE_LABEL: Record<string, string> = {
  chat: "对话",
  quick_input: "快速记录",
  journal: "日记",
  reminder: "提醒",
  system: "系统",
};

/** 问候语（按本地小时） */
function getGreeting(hour: number): string {
  if (hour < 5) return "夜深了";
  if (hour < 12) return "早安";
  if (hour < 18) return "午安";
  return "晚安";
}

/** 周几中文 */
const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

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
      hideHeader
      maxWidth={1040}
    >
      <div className="flex flex-col gap-5 pb-12">
        {/* ===== ① Hero Briefing ===== */}
        {data && <HeroBriefing data={data} />}

        {/* ===== ② Command Bar ===== */}
        <CommandBar
          value={quickInput}
          onChange={setQuickInput}
          onSubmit={handleQuickSubmit}
          submitting={submitting}
        />

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3 text-xs text-destructive/90">
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
          <div className="flex flex-col gap-5">
            {/* ===== ③ Focus Row（2 张主卡） ===== */}
            <div className="grid gap-4 md:grid-cols-2">
              <FocusTaskCard task={data.topOfToday} />
              <FocusSummaryCard
                review={data.todaySummary}
                generating={generatingSummary}
                onGenerate={handleGenerateSummary}
              />
            </div>

            {/* ===== ④ Risk Strip（监督信息收纳） ===== */}
            <RiskStrip
              overdue={data.overdue}
              highDelay={data.highDelay}
              harsh={data.harsh}
              recentlyTriggeredReminders={data.recentlyTriggeredReminders}
            />

            {/* ===== ⑤ Activity Grid（底部弱化收纳） ===== */}
            <ActivityGrid
              dueToday={data.dueToday}
              doing={data.doing}
              delayed={data.delayed}
              recentEvents={data.recentEvents}
              recentJournals={data.recentJournals}
              recentIdeas={data.recentIdeas}
            />
          </div>
        )}
      </div>
    </PagePlaceholder>
  );
}

// =========================================================================
// ① Hero Briefing - 顶部 Hero 区（HeroPanel + MetricPills）
// =========================================================================

function HeroBriefing({ data }: { data: DashboardData }) {
  const setPage = useAppStore((s) => s.setPage);
  const now = new Date();
  const hour = now.getHours();
  const greeting = getGreeting(hour);
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const weekday = WEEKDAY_LABEL[now.getDay()];

  const dueCount = data.dueToday.length;
  const overdueCount = data.overdue.length;
  const highDelayCount = data.highDelay.length;
  const inputCount = data.recentEvents.length;
  const topTitle = data.topOfToday?.title;

  // 烛照判断 - 分两层：主判断 + 弱提示
  let mainJudgment: string;
  let hint: string | null = null;
  if (topTitle) {
    mainJudgment = `今天真正要推进的是「${topTitle}」。`;
    if (overdueCount > 0) {
      hint = `你有 ${overdueCount} 件事已经逾期，别绕开它们。`;
    } else {
      hint = `节奏不错，继续往前。`;
    }
  } else if (inputCount > 0) {
    mainJudgment = "今天已经有一些记录了，可以先从最近输入里挑一件推进。";
  } else {
    mainJudgment = "今天还很安静，先记录一件最重要的事。";
  }

  return (
    <HeroPanel className="flex flex-col gap-6 p-7 md:flex-row md:items-center md:justify-between md:gap-10">
      {/* 左侧：三层信息 */}
      <div className="flex flex-col gap-2.5">
        {/* 第一层：大标题 + 日期 */}
        <div className="flex items-baseline gap-3">
          <h2 className="text-display text-foreground">{greeting}</h2>
          <span className="text-meta">
            {month} 月 {date} 日 · 周{weekday}
          </span>
        </div>
        {/* 第二层：主判断 */}
        <p className="text-lg font-medium leading-snug text-foreground/90 tracking-tight">
          {mainJudgment}
        </p>
        {/* 第三层：弱提示 */}
        {hint && (
          <p className="text-body text-muted-foreground leading-relaxed">
            {hint}
          </p>
        )}
      </div>

      {/* 右侧：2×2 MetricPill - 全部可点击跳转 */}
      <div className="grid grid-cols-2 gap-2 md:flex-shrink-0">
        <MetricPill
          label="今日到期"
          value={dueCount}
          tone={dueCount > 0 ? "warn" : "default"}
          onClick={() => setPage("tasks")}
          className="cursor-pointer"
        />
        <MetricPill
          label="已逾期"
          value={overdueCount}
          tone={overdueCount > 0 ? "danger" : "default"}
          onClick={() => setPage("tasks")}
          className="cursor-pointer"
        />
        <MetricPill
          label="高延期"
          value={highDelayCount}
          tone={highDelayCount > 0 ? "warn" : "default"}
          onClick={() => setPage("tasks")}
          className="cursor-pointer"
        />
        <MetricPill
          label="今日输入"
          value={inputCount}
          onClick={() => setPage("inbox")}
          className="cursor-pointer"
        />
      </div>
    </HeroPanel>
  );
}

// =========================================================================
// ② Command Bar - Raycast 风格快速输入
// =========================================================================

interface CommandBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

function CommandBar({ value, onChange, onSubmit, submitting }: CommandBarProps) {
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm px-3 py-2.5 tz-transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15">
        <Zap className="h-4 w-4 shrink-0 text-primary/60" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="记录任务、日记、灵感，或者直接说你卡住了什么…"
          className="flex-1 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !value.trim()}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20 tz-transition hover:bg-primary/90 active:scale-95 disabled:opacity-40 disabled:saturate-50"
          aria-label="提交"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
        Enter 发送 · ⌘+I 全局唤起
      </div>
    </div>
  );
}

// =========================================================================
// ③ Focus Row - 今日重点任务 + 今日总结 Daily Brief
// =========================================================================

function FocusTaskCard({ task }: { task: TaskRow | null }) {
  const setPage = useAppStore((s) => s.setPage);
  // 仅在存在 topOfToday 时可点击跳转
  const clickable = !!task;
  return (
    <SoftCard
      className={cn(
        "flex flex-col p-5 tz-transition",
        clickable && "cursor-pointer hover:bg-card/70 hover:border-border/30",
      )}
      onClick={clickable ? () => setPage("tasks") : undefined}
      title={clickable ? "查看任务" : undefined}
      role={clickable ? "button" : undefined}
    >
      <SectionHeader icon={Zap} title="今日重点" count={task ? 1 : 0} />
      {task ? (
        <div className="mt-3 flex flex-1 flex-col gap-3">
          {/* 任务标题 */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-base font-semibold leading-snug">{task.title}</h4>
            <TaskPriorityBadge priority={task.priority} />
          </div>
          {task.description && (
            <p className="text-body text-muted-foreground line-clamp-2 leading-relaxed">
              {task.description}
            </p>
          )}
          {/* 状态行 */}
          <div className="flex items-center gap-2 text-caption">
            <TaskStatusBadge status={task.status} />
            {task.due_at && (
              <span className="flex items-center gap-0.5 text-muted-foreground/80">
                <Calendar className="h-3 w-3" />
                {format(new Date(task.due_at), "MM-dd HH:mm")}
              </span>
            )}
            {task.delay_count > 0 && (
              <span className="text-amber-400/90">延期 {task.delay_count} 次</span>
            )}
          </div>
          {/* 下一步 - 静态建议区（不新增按钮行为） */}
          <div className="mt-auto rounded-lg border border-border/30 bg-muted/20 p-3">
            <div className="text-[10px] font-medium text-muted-foreground/70 mb-1">
              下一步
            </div>
            <p className="text-xs leading-relaxed text-foreground/80">
              先拆成一个 15 分钟动作，别继续停在"准备一下"。
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 items-center">
          <EmptyHint icon={Zap} text="今天还没有重点。先写下一件最该推进的事。" />
        </div>
      )}
    </SoftCard>
  );
}

function FocusSummaryCard({
  review,
  generating,
  onGenerate,
}: {
  review: ReviewRow | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  const setPage = useAppStore((s) => s.setPage);
  return (
    <SoftCard
      className="cursor-pointer p-5 tz-transition hover:bg-card/70 hover:border-border/30"
      onClick={() => setPage("reviews")}
      title="查看总结"
      role="button"
    >
      <div className="mb-3 flex items-center justify-between">
        <SectionHeader icon={Sparkles} title="今日总结" />
        {/* 重新生成按钮 - 必须阻止冒泡，避免触发卡片 onClick */}
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onGenerate();
          }}
          disabled={generating}
          className="h-7 text-[11px]"
        >
          {generating ? (
            <RefreshCw className="mr-1.5 h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3 w-3" />
          )}
          {generating
            ? "生成中..."
            : review
              ? "重新生成"
              : "生成今日总结"}
        </Button>
      </div>

      {generating ? (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          正在生成今日总结...
        </div>
      ) : review ? (
        <DailyBrief review={review} />
      ) : (
        <EmptyHint icon={ClipboardList} text="今日未生成总结" />
      )}
    </SoftCard>
  );
}

/** Daily Brief - 减密：主总结 2 行 + 4 个轻 chips */
function DailyBrief({ review }: { review: ReviewRow }) {
  const sections = parseSections(review.sections);
  return (
    <div className="flex flex-col gap-3">
      {/* 主总结 - 最多 2 行 */}
      <p className="whitespace-pre-wrap break-words text-body text-foreground/85 line-clamp-2 leading-relaxed">
        {review.raw_content}
      </p>
      {/* 4 个轻 chips - 每条最多 1-2 行 */}
      {sections && (
        <div className="grid grid-cols-2 gap-1.5">
          {sections.wins && sections.wins.length > 0 && (
            <div className="rounded-md border border-border/20 bg-emerald-500/[0.03] px-2 py-1.5">
              <div className="text-[10px] font-medium text-emerald-400/70 mb-0.5">
                做成 · {sections.wins.length}
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                {sections.wins.join("、")}
              </p>
            </div>
          )}
          {sections.delays && sections.delays.length > 0 && (
            <div className="rounded-md border border-border/20 bg-amber-500/[0.03] px-2 py-1.5">
              <div className="text-[10px] font-medium text-amber-400/70 mb-0.5">
                拖延 · {sections.delays.length}
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                {sections.delays.join("、")}
              </p>
            </div>
          )}
          {sections.topNext && (
            <div className="rounded-md border border-border/20 bg-sky-500/[0.03] px-2 py-1.5">
              <div className="text-[10px] font-medium text-sky-400/70 mb-0.5">明天重点</div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                {sections.topNext}
              </p>
            </div>
          )}
          {sections.improvement && (
            <div className="rounded-md border border-border/20 bg-violet-500/[0.03] px-2 py-1.5">
              <div className="text-[10px] font-medium text-violet-400/70 mb-0.5">改进</div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                {sections.improvement}
              </p>
            </div>
          )}
        </div>
      )}
      <div className="text-meta text-muted-foreground/40">
        生成于 {format(new Date(review.created_at), "yyyy-MM-dd HH:mm")}
      </div>
    </div>
  );
}

// =========================================================================
// ④ Risk Strip - 监督信息收纳（CompactRow + 2px 风险细条）
// =========================================================================

interface RiskStripProps {
  overdue: TaskRow[];
  highDelay: TaskRow[];
  harsh: TaskRow[];
  recentlyTriggeredReminders: ReminderRow[];
}

function RiskStrip({ overdue, highDelay, harsh, recentlyTriggeredReminders }: RiskStripProps) {
  const setPage = useAppStore((s) => s.setPage);
  const total = overdue.length + highDelay.length + harsh.length + recentlyTriggeredReminders.length;
  const isEmpty = total === 0;
  const goTasks = () => setPage("tasks");

  return (
    <SoftCard
      className={cn(
        "p-5 tz-transition",
        !isEmpty && "cursor-pointer hover:bg-card/70 hover:border-border/30",
      )}
      onClick={isEmpty ? undefined : goTasks}
      title={isEmpty ? undefined : "去任务页处理"}
      role={isEmpty ? undefined : "button"}
    >
      <SectionHeader
        icon={AlertTriangle}
        title="别绕开的事"
        count={total}
        tone={isEmpty ? "default" : "warn"}
      />
      {isEmpty ? (
        <div className="mt-3">
          <EmptyHint icon={AlertTriangle} text="今天没有要绕开的事，节奏不错。" />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          {/* 已逾期 */}
          {overdue.map((t) => (
            <CompactRow
              key={`overdue-${t.id}`}
              risk="overdue"
              rightSlot={
                <>
                  <StatusChip tone="rose">逾期</StatusChip>
                  {t.due_at && (
                    <span className="tabular-nums">
                      {format(new Date(t.due_at), "MM-dd HH:mm")}
                    </span>
                  )}
                </>
              }
            >
              {t.title}
            </CompactRow>
          ))}
          {/* 高延期 */}
          {highDelay.map((t) => (
            <CompactRow
              key={`hd-${t.id}`}
              risk={t.delay_count >= 2 ? "harsh" : "delay"}
              rightSlot={
                <>
                  <StatusChip tone="amber">延期 {t.delay_count}</StatusChip>
                  <TaskStatusBadge status={t.status} />
                </>
              }
            >
              {t.title}
            </CompactRow>
          ))}
          {/* 烛照监督追问 - 统一 CompactRow，不再用 HarshHighlight 整条红框 */}
          {harsh.map((t) => (
            <CompactRow
              key={`harsh-${t.id}`}
              risk="harsh"
              rightSlot={
                <>
                  <StatusChip tone="amber">烛照追问</StatusChip>
                  {t.delay_count > 0 && (
                    <span className="text-amber-400/80">延期 {t.delay_count}</span>
                  )}
                </>
              }
            >
              {t.title}
            </CompactRow>
          ))}
          {/* 最近触发提醒 */}
          {recentlyTriggeredReminders.map((r) => (
            <CompactRow
              key={`rem-${r.id}`}
              risk="delay"
              rightSlot={
                <>
                  <ReminderStatusLabel status={r.status} />
                  <span className="tabular-nums">
                    {format(new Date(r.remind_at), "MM-dd HH:mm")}
                  </span>
                </>
              }
            >
              {r.message || "提醒"}
            </CompactRow>
          ))}
        </div>
      )}
    </SoftCard>
  );
}

// =========================================================================
// ⑤ Activity Grid - 底部弱化收纳（6 组 CompactRow）
// =========================================================================

interface ActivityGridProps {
  dueToday: TaskRow[];
  doing: TaskRow[];
  delayed: TaskRow[];
  recentEvents: EventRow[];
  recentJournals: JournalEntryRow[];
  recentIdeas: IdeaRow[];
}

function ActivityGrid({
  dueToday,
  doing,
  delayed,
  recentEvents,
  recentJournals,
  recentIdeas,
}: ActivityGridProps) {
  const setPage = useAppStore((s) => s.setPage);

  // 可点击卡片包装：仅有内容时才可点
  const clickable = (hasContent: boolean, page: Parameters<typeof setPage>[0], title: string) => ({
    onClick: hasContent ? () => setPage(page) : undefined,
    className: cn(
      "p-4 tz-transition",
      hasContent && "cursor-pointer hover:bg-card/70 hover:border-border/30",
    ),
    title: hasContent ? title : undefined,
    role: hasContent ? ("button" as const) : undefined,
  });

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* 今日到期 */}
      <SoftCard {...clickable(dueToday.length > 0, "tasks", "查看今日到期任务")}>
        <SectionHeader icon={Clock} title="今日到期" count={dueToday.length} />
        <ScrollArea className="mt-2 h-32">
          {dueToday.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {dueToday.slice(0, 3).map((t) => (
                <CompactRow
                  key={`due-${t.id}`}
                  rightSlot={
                    t.due_at && (
                      <span className="tabular-nums">
                        {format(new Date(t.due_at), "HH:mm")}
                      </span>
                    )
                  }
                >
                  {t.title}
                </CompactRow>
              ))}
            </div>
          ) : (
            <EmptyHint icon={Clock} text="无" />
          )}
        </ScrollArea>
      </SoftCard>

      {/* 进行中 */}
      <SoftCard {...clickable(doing.length > 0, "tasks", "查看进行中任务")}>
        <SectionHeader icon={CheckCircle2} title="进行中" count={doing.length} />
        <ScrollArea className="mt-2 h-32">
          {doing.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {doing.slice(0, 3).map((t) => (
                <CompactRow
                  key={`do-${t.id}`}
                  rightSlot={<TaskStatusBadge status={t.status} />}
                >
                  {t.title}
                </CompactRow>
              ))}
            </div>
          ) : (
            <EmptyHint icon={CheckCircle2} text="无" />
          )}
        </ScrollArea>
      </SoftCard>

      {/* 已延期任务 */}
      <SoftCard {...clickable(delayed.length > 0, "tasks", "查看延期任务")}>
        <SectionHeader icon={Clock} title="已延期任务" count={delayed.length} tone={delayed.length > 0 ? "warn" : "default"} />
        <ScrollArea className="mt-2 h-32">
          {delayed.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {delayed.slice(0, 3).map((t) => (
                <CompactRow
                  key={`dl-${t.id}`}
                  risk="delay"
                  rightSlot={<StatusChip tone="amber">延期 {t.delay_count}</StatusChip>}
                >
                  {t.title}
                </CompactRow>
              ))}
            </div>
          ) : (
            <EmptyHint icon={Clock} text="无" />
          )}
        </ScrollArea>
      </SoftCard>

      {/* 今日输入 */}
      <SoftCard {...clickable(recentEvents.length > 0, "inbox", "查看今日输入")}>
        <SectionHeader icon={Zap} title="今日输入" count={recentEvents.length} />
        <ScrollArea className="mt-2 h-32">
          {recentEvents.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {recentEvents.slice(0, 3).map((e) => (
                <CompactRow
                  key={`ev-${e.id}`}
                  rightSlot={
                    <StatusChip tone="zinc">
                      {SOURCE_LABEL[e.source] ?? e.source}
                    </StatusChip>
                  }
                >
                  {e.raw_content}
                </CompactRow>
              ))}
            </div>
          ) : (
            <EmptyHint icon={Zap} text="还没有输入" />
          )}
        </ScrollArea>
      </SoftCard>

      {/* 最近日记 */}
      <SoftCard {...clickable(recentJournals.length > 0, "journal", "查看日记")}>
        <SectionHeader icon={FileText} title="最近日记" count={recentJournals.length} />
        <ScrollArea className="mt-2 h-32">
          {recentJournals.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {recentJournals.slice(0, 3).map((j) => (
                <CompactRow
                  key={`jr-${j.id}`}
                  rightSlot={
                    <span className="tabular-nums">{j.entry_date}</span>
                  }
                >
                  <span className="line-clamp-1 text-xs leading-relaxed text-foreground/85">
                    {j.raw_content}
                  </span>
                </CompactRow>
              ))}
            </div>
          ) : (
            <EmptyHint icon={FileText} text="还没有日记" />
          )}
        </ScrollArea>
      </SoftCard>

      {/* 最近灵感 */}
      <SoftCard {...clickable(recentIdeas.length > 0, "ideas", "查看灵感")}>
        <SectionHeader icon={Lightbulb} title="最近灵感" count={recentIdeas.length} />
        <ScrollArea className="mt-2 h-32">
          {recentIdeas.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {recentIdeas.slice(0, 3).map((i) => (
                <CompactRow
                  key={`id-${i.id}`}
                  rightSlot={
                    i.summary && (
                      <span className="line-clamp-1 max-w-[120px] text-muted-foreground/60">
                        {i.summary}
                      </span>
                    )
                  }
                >
                  <span className="truncate text-xs font-medium">💡 {i.title}</span>
                </CompactRow>
              ))}
            </div>
          ) : (
            <EmptyHint icon={Lightbulb} text="还没有灵感" />
          )}
        </ScrollArea>
      </SoftCard>
    </div>
  );
}

// =========================================================================
// 通用子组件
// =========================================================================

/** Reminder 状态中文标签 - 统一为 StatusChip 胶囊（弱化） */
function ReminderStatusLabel({ status }: { status: ReminderRow["status"] }) {
  const label: Record<ReminderRow["status"], string> = {
    pending: "等待",
    fired: "已触发",
    snoozed: "已稍后",
    resolved: "已解决",
    cancelled: "已取消",
  };
  const tone: Record<ReminderRow["status"], "zinc" | "amber" | "sky" | "emerald"> = {
    pending: "zinc",
    fired: "amber",
    snoozed: "sky",
    resolved: "emerald",
    cancelled: "zinc",
  };
  return <StatusChip tone={tone[status]}>{label[status]}</StatusChip>;
}

/**
 * StatusChip - 统一的状态小胶囊
 * - h-5 rounded-full px-2 text-[11px]
 * - 低饱和背景 + 对应色文字
 * - 用于 CompactRow 右侧 slot，所有状态胶囊尺寸统一
 */
function StatusChip({
  children,
  tone = "zinc",
}: {
  children: ReactNode;
  tone?: "zinc" | "amber" | "rose" | "sky" | "emerald";
}) {
  const toneClass: Record<string, string> = {
    zinc: "bg-muted/40 text-muted-foreground/80",
    amber: "bg-amber-500/10 text-amber-300/90",
    rose: "bg-rose-500/10 text-rose-300/90",
    sky: "bg-sky-500/10 text-sky-300/90",
    emerald: "bg-emerald-500/10 text-emerald-300/90",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center justify-center rounded-full px-2 text-[11px] font-medium leading-none",
        toneClass[tone],
      )}
    >
      {children}
    </span>
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
