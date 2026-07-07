/**
 * Inbox Page - 收集箱（输入处理工作台）
 *
 * UX-4A 交互增强：
 * - EventCard 支持点击展开 / 收起详情（一次只展开一个）
 * - 展开后显示：raw_content / source / event_type / created_at / ai_processed / metadata
 * - 待 AI 整理 / 整理失败时显示「重新整理」按钮（复用现有 runIntake）
 *
 * UX-4B 手动转任务：
 * - EventCard 展开区增加「转成任务」按钮
 * - CreateTaskFromEventDialog：标题默认取 raw_content 前 40 字，描述默认填入完整 raw_content
 * - 复用 task-repo.createTask，写入 source_event_id 以便追溯
 *
 * UX-Inbox 重构：
 * - 新增 4 个 Tabs：待处理 / 已沉淀 / 主动记录 / 全部原始记录
 * - 默认选中「待处理」，隐藏普通 chat 流水
 * - 普通已处理 chat 不出现在默认视图，仅在「全部原始记录」可查
 * - 不删除任何 event，仅前端筛选
 *
 * 不变量：
 * - 不改数据库 schema / Rust / migrations
 * - 不改 LLM Intake 核心逻辑（仅调用 runIntake）
 * - 不新增删除 event、不新增转日记 / 转灵感
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Inbox,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Calendar,
  Flag,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { Button } from "@/components/ui/button";
import { SoftCard } from "@/components/ui/soft-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listRecent } from "@/lib/repositories/event-repo";
import {
  createTask,
  getTaskBySourceEventId,
  listBySourceEventIds,
} from "@/lib/repositories/task-repo";
import { runIntake } from "@/lib/intake/run-intake";
import { useAppStore } from "@/stores/app-store";
import type { EventRow, TaskRow } from "@/types/db";
import type { TaskPriority } from "@/types/enums";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 标签映射
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<string, string> = {
  chat: "对话",
  quick_input: "快速记录",
  journal: "日记",
  reminder: "提醒",
  system: "系统",
};

const SOURCE_CLASS: Record<string, string> = {
  chat: "bg-sky-400/12 text-sky-300 border-sky-400/25",
  quick_input: "bg-amber-500/12 text-amber-300 border-amber-500/25",
  journal: "bg-violet-500/12 text-violet-300 border-violet-500/25",
  reminder: "bg-orange-500/12 text-orange-300 border-orange-500/25",
  system: "bg-zinc-500/12 text-zinc-400 border-zinc-500/25",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  user_input: "用户输入",
  system_generated: "系统生成",
  ai_processed: "AI 处理",
  unknown: "未标注",
};

/** intake_status（写入 events.metadata）的中文映射 */
const INTAKE_STATUS_LABEL: Record<string, string> = {
  no_provider: "未配置 Provider",
  network_error: "网络错误",
  timeout: "请求超时",
  http_error: "HTTP 错误",
  parse_error: "解析失败",
  schema_error: "结构错误",
  unknown_error: "未知错误",
  risk_high: "高风险待确认",
};

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

// ---------------------------------------------------------------------------
// Tab 类型与分类辅助
// ---------------------------------------------------------------------------

type InboxTab = "pending" | "settled" | "manual" | "all";

/** 判断是否已沉淀（已转任务） */
function isSettledEvent(eventId: string, taskMap: Record<string, TaskRow>): boolean {
  return Boolean(taskMap[eventId]);
}

/** 判断是否主动记录（仅 quick_input，不含 chat / journal / reminder / system） */
function isManualEvent(event: EventRow): boolean {
  return event.source === "quick_input";
}

/** 判断是否应出现在「待处理」视图 */
function isPendingEvent(
  event: EventRow,
  metadata: Record<string, unknown> | null,
  taskMap: Record<string, TaskRow>,
): boolean {
  // 已转任务的 → 去「已沉淀」
  if (isSettledEvent(event.id, taskMap)) return false;
  // 待 AI 整理（含未处理 + 失败，失败时 metadata.intake_status 存在）
  if (event.ai_processed === 0) return true;
  // 已处理但 metadata 有 intake_status（防御，理论上 ai_processed=0）
  if (metadata && typeof metadata.intake_status === "string") return true;
  // 已正常处理的 chat 流水 → 不显示在待处理
  return false;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function InboxPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [taskMap, setTaskMap] = useState<Record<string, TaskRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<EventRow | null>(null);
  // 默认选中「待处理」
  const [tab, setTab] = useState<InboxTab>("pending");
  const setQuickInputOpen = useAppStore((s) => s.setQuickInputOpen);
  const setPage = useAppStore((s) => s.setPage);

  const reloadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listRecent(50);
      setEvents(rows);
      // 批量查询这些 event 是否已转任务，建立 event.id -> TaskRow 映射
      const eventIds = rows.map((r) => r.id);
      const tasks = await listBySourceEventIds(eventIds);
      const map: Record<string, TaskRow> = {};
      for (const t of tasks) {
        if (t.source_event_id) {
          // 同一 event 只取第一条（按 created_at ASC）
          if (!map[t.source_event_id]) {
            map[t.source_event_id] = t;
          }
        }
      }
      setTaskMap(map);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleReprocess = async (event: EventRow) => {
    if (reprocessingId) return;
    setReprocessingId(event.id);
    try {
      // Inbox 非聊天来源，conversation 传 null
      const result = await runIntake(event, null);
      if (result.success) {
        toast.success("已重新整理", { description: result.summary });
      } else {
        toast.error("整理失败", { description: result.summary });
      }
      await reloadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("整理异常", { description: msg });
    } finally {
      setReprocessingId(null);
    }
  };

  // 按 tab 筛选 events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const metadata = parseMetadata(event.metadata);
      switch (tab) {
        case "pending":
          return isPendingEvent(event, metadata, taskMap);
        case "settled":
          return isSettledEvent(event.id, taskMap);
        case "manual":
          return isManualEvent(event);
        case "all":
          return true;
        default:
          return true;
      }
    });
  }, [events, tab, taskMap]);

  // 各 tab 的 count
  const tabCounts = useMemo(() => {
    let pending = 0;
    let settled = 0;
    let manual = 0;
    for (const event of events) {
      const metadata = parseMetadata(event.metadata);
      if (isPendingEvent(event, metadata, taskMap)) pending++;
      if (isSettledEvent(event.id, taskMap)) settled++;
      if (isManualEvent(event)) manual++;
    }
    return { pending, settled, manual, all: events.length };
  }, [events, taskMap]);

  return (
    <PagePlaceholder
      title="收集"
      description="需要整理、追溯和处理的原始输入"
      icon={Inbox}
      emptyHint="没有待处理输入"
      action={
        <Button onClick={() => setQuickInputOpen(true)}>
          <Zap className="mr-1.5 h-4 w-4" />
          快速记录 (⌘+I)
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-12">
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3 text-xs text-destructive/90">
            加载失败：{error}
          </div>
        )}

        {/* Tabs */}
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as InboxTab)}
          className="mb-2"
        >
          <TabsList>
            <TabsTrigger value="pending">
              待处理
              {tabCounts.pending > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground/70">
                  {tabCounts.pending}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="settled">
              已沉淀
              {tabCounts.settled > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground/70">
                  {tabCounts.settled}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="manual">
              主动记录
              {tabCounts.manual > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground/70">
                  {tabCounts.manual}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">
              最近原始记录
              {tabCounts.all > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground/70">
                  {tabCounts.all}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 「最近原始记录」提示 */}
        {tab === "all" && (
          <div className="rounded-lg border border-border/20 bg-card/30 px-3 py-2 text-[11px] text-muted-foreground/65">
            这里显示最近 50 条完整事件日志，用于追溯和排查。日常不需要逐条查看。
          </div>
        )}

        {/* 列表 */}
        {loading ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            加载中...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground/50">
            <Inbox className="h-10 w-10" strokeWidth={1.5} />
            {tab === "pending" ? (
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-sm">没有待处理输入</p>
                <p className="text-xs text-muted-foreground/50">
                  普通聊天不会堆在这里。需要处理的记录、失败项和主动收集会出现在这里。
                </p>
              </div>
            ) : (
              <p className="text-sm">
                {tab === "settled" && "还没有已沉淀的记录"}
                {tab === "manual" && "还没有主动记录"}
                {tab === "all" && "没有事件记录"}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                task={taskMap[event.id] ?? null}
                expanded={expandedId === event.id}
                onToggle={() => toggleExpand(event.id)}
                onReprocess={() => handleReprocess(event)}
                reprocessing={reprocessingId === event.id}
                onConvert={() => setConvertTarget(event)}
                onGoToTasks={() => setPage("tasks")}
              />
            ))}
          </div>
        )}
      </div>

      {/* UX-4B: 转成任务 Dialog */}
      {convertTarget && (
        <CreateTaskFromEventDialog
          event={convertTarget}
          onClose={() => setConvertTarget(null)}
          onCreated={() => {
            setConvertTarget(null);
            reloadData();
          }}
        />
      )}
    </PagePlaceholder>
  );
}

// ---------------------------------------------------------------------------
// EventCard
// ---------------------------------------------------------------------------

interface EventCardProps {
  event: EventRow;
  task: TaskRow | null;
  expanded: boolean;
  onToggle: () => void;
  onReprocess: () => void;
  reprocessing: boolean;
  onConvert: () => void;
  onGoToTasks: () => void;
}

function EventCard({
  event,
  task,
  expanded,
  onToggle,
  onReprocess,
  reprocessing,
  onConvert,
  onGoToTasks,
}: EventCardProps) {
  const sourceLabel = SOURCE_LABEL[event.source] ?? event.source;
  const sourceClass = SOURCE_CLASS[event.source] ?? SOURCE_CLASS.system;
  const typeLabel = EVENT_TYPE_LABEL[event.event_type] ?? EVENT_TYPE_LABEL.unknown;

  const metadata = parseMetadata(event.metadata);
  const intakeStatus = readString(metadata, "intake_status");
  const intakeError = readString(metadata, "intake_error");
  const intakeAt = readString(metadata, "intake_at");
  const intakeStatusLabel = intakeStatus
    ? INTAKE_STATUS_LABEL[intakeStatus] ?? intakeStatus
    : null;

  // 是否显示「重新整理」按钮：ai_processed === 0（含待整理 + 整理失败）
  const showReprocessBtn = event.ai_processed === 0;

  return (
    <SoftCard
      className={cn(
        "cursor-pointer select-none",
        expanded && "bg-card/80 border-primary/20",
      )}
      onClick={onToggle}
      title="查看收集详情"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {/* 主体：raw_content + 状态 */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p
              className={cn(
                "break-words text-foreground/90 whitespace-pre-wrap",
                expanded ? "text-base leading-7" : "text-sm leading-relaxed line-clamp-2",
              )}
            >
              {event.raw_content}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            <StatusPill
              aiProcessed={event.ai_processed}
              intakeStatus={intakeStatus}
            />
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground/65" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground/65" />
            )}
          </div>
        </div>

        {/* 折叠态 meta 行：来源 + 是否已转任务 */}
        {!expanded && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/80">
            <Badge variant="outline" className={cn("text-[11px]", sourceClass)}>
              {sourceLabel}
            </Badge>
            {task && (
              <Badge variant="outline" className="text-[11px] border-emerald-500/25 bg-emerald-500/12 text-emerald-300">
                已转任务
              </Badge>
            )}
            <span>· {typeLabel}</span>
            <span>· {format(new Date(event.created_at), "MM-dd HH:mm")}</span>
          </div>
        )}
      </div>

      {/* 展开态：详情 */}
      {expanded && (
        <div className="border-t border-border/15 px-3.5 py-3">
          <DetailGrid
            items={[
              { label: "来源", value: sourceLabel },
              { label: "类型", value: typeLabel },
              {
                label: "创建时间",
                value: format(new Date(event.created_at), "yyyy-MM-dd HH:mm:ss"),
              },
              {
                label: "AI 处理",
                value:
                  event.ai_processed === 1
                    ? "已整理"
                    : intakeStatus
                      ? `整理失败 · ${intakeStatusLabel}`
                      : "待整理",
              },
            ]}
          />

          {/* intake 详情（仅失败时存在） */}
          {(intakeStatus || intakeError || intakeAt) && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-2.5">
              <div className="mb-1 text-[11px] font-medium text-amber-300/90">
                整理失败详情
              </div>
              <DetailGrid
                compact
                items={[
                  intakeStatus
                    ? { label: "状态", value: intakeStatusLabel ?? intakeStatus }
                    : null,
                  intakeError
                    ? { label: "错误", value: intakeError }
                    : null,
                  intakeAt
                    ? {
                        label: "时间",
                        value: format(new Date(intakeAt), "yyyy-MM-dd HH:mm:ss"),
                      }
                    : null,
                ].filter((x): x is NonNullable<typeof x> => x !== null)}
              />
            </div>
          )}

          {/* metadata JSON 预览（排除已展示的 intake 字段） */}
          {metadata && <MetadataPreview metadata={metadata} />}

          {/* 操作区：已转任务状态 / 转成任务 + 重新整理（按状态显示） */}
          {task ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              {/* 已转任务状态 */}
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="text-[11px] font-medium text-emerald-300/90">
                    已转成任务
                  </span>
                  <span className="truncate text-xs text-muted-foreground/70">
                    {task.title}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onGoToTasks();
                }}
                className="h-8 shrink-0"
              >
                去任务页
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-end gap-2">
              {event.ai_processed === 1 && (
                <span className="mr-1 text-xs text-emerald-400/70">
                  已整理
                </span>
              )}
              {showReprocessBtn && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reprocessing}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReprocess();
                  }}
                  className="h-8"
                >
                  <RefreshCw
                    className={cn(
                      "mr-1.5 h-3.5 w-3.5",
                      reprocessing && "animate-spin",
                    )}
                  />
                  {reprocessing ? "整理中..." : "重新整理"}
                </Button>
              )}
              <Button
                size="sm"
                variant="default"
                onClick={(e) => {
                  e.stopPropagation();
                  onConvert();
                }}
                className="h-8"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                转成任务
              </Button>
            </div>
          )}
        </div>
      )}
    </SoftCard>
  );
}

// ---------------------------------------------------------------------------
// StatusPill - 状态胶囊
// ---------------------------------------------------------------------------

function StatusPill({
  aiProcessed,
  intakeStatus,
}: {
  aiProcessed: number;
  intakeStatus: string | null;
}) {
  if (aiProcessed === 1) {
    return (
      <span className="inline-flex h-5 items-center rounded-full bg-emerald-500/12 px-2 text-[11px] font-medium text-emerald-300">
        已整理
      </span>
    );
  }
  if (intakeStatus) {
    return (
      <span className="inline-flex h-5 items-center rounded-full bg-rose-500/12 px-2 text-[11px] font-medium text-rose-300">
        失败
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 items-center rounded-full bg-zinc-500/12 px-2 text-[11px] font-medium text-zinc-400">
      待整理
    </span>
  );
}

// ---------------------------------------------------------------------------
// DetailGrid - 详情键值对
// ---------------------------------------------------------------------------

interface DetailItem {
  label: string;
  value: string;
}

function DetailGrid({
  items,
  compact,
}: {
  items: DetailItem[];
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-2",
        compact ? "text-[11px]" : "text-xs",
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="flex flex-col">
          <span className="text-muted-foreground/65">{item.label}</span>
          <span className="text-foreground/80 break-words">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetadataPreview - metadata JSON 弱化预览
// ---------------------------------------------------------------------------

const KNOWN_METADATA_KEYS = new Set([
  "intake_status",
  "intake_error",
  "intake_at",
  "llm_raw_response_preview",
]);

function MetadataPreview({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) {
  // 排除已知字段，只展示其余
  const extraKeys = Object.keys(metadata).filter(
    (k) => !KNOWN_METADATA_KEYS.has(k),
  );
  if (extraKeys.length === 0) return null;

  const preview: Record<string, unknown> = {};
  for (const k of extraKeys) {
    preview[k] = metadata[k];
  }

  let previewStr: string;
  try {
    previewStr = JSON.stringify(preview, null, 2);
  } catch {
    return null;
  }

  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] text-muted-foreground/60">
        其他元数据
      </div>
      <pre className="overflow-x-auto rounded-lg bg-background/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground/70 whitespace-pre-wrap break-all">
        {previewStr}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

function parseMetadata(
  raw: string | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function readString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!metadata) return null;
  const val = metadata[key];
  if (typeof val === "string" && val.length > 0) return val;
  return null;
}

// ---------------------------------------------------------------------------
// fromDatetimeLocal - datetime-local 字符串转 ISO
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

// ---------------------------------------------------------------------------
// CreateTaskFromEventDialog - 从收集项创建任务
// ---------------------------------------------------------------------------

function CreateTaskFromEventDialog({
  event,
  onClose,
  onCreated,
}: {
  event: EventRow;
  onClose: () => void;
  onCreated: () => void;
}) {
  // 默认标题：raw_content 前 40 字（去首尾空白）
  const defaultTitle = event.raw_content.trim().slice(0, 40);
  // 默认描述：完整 raw_content（保留原始格式，不 trim）
  const defaultDesc = event.raw_content;

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDesc);
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
      // 防重复：提交前再查一次是否已有关联任务（避免双击 / 并发）
      const existing = await getTaskBySourceEventId(event.id);
      if (existing) {
        toast.warning("这条收集已经转成任务", {
          description: existing.title,
        });
        onCreated();
        return;
      }
      const dueAtIso = dueAt ? fromDatetimeLocal(dueAt) : null;
      const task = await createTask({
        title: trimmedTitle,
        description: description.trim() || null,
        due_at: dueAtIso,
        priority,
        status: "inbox",
        source_event_id: event.id,
      });
      toast.success("已创建任务", {
        description: task.title,
      });
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
              <span className="text-sm font-medium">从收集项创建任务</span>
              <span className="text-[10px] text-muted-foreground/70">
                源自 {SOURCE_LABEL[event.source] ?? event.source} · {format(new Date(event.created_at), "MM-dd HH:mm")}
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
          {/* 原文预览（只读） */}
          <div className="rounded-lg border border-border/15 bg-background/40 p-2.5">
            <div className="mb-1 text-[11px] text-muted-foreground/60">
              收集原文
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground/80 whitespace-pre-wrap break-words line-clamp-3">
              {event.raw_content}
            </p>
          </div>

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
              <div className="flex h-10 items-center gap-1">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-xs tz-transition",
                      priority === opt.value
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground/70 hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 底部操作 */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="h-9"
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="h-9"
            >
              {submitting ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              {submitting ? "创建中..." : "创建任务"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
