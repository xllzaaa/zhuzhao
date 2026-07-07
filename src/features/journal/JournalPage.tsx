/**
 * Journal Page - Phase 7 + UX-5A 交互增强
 *
 * 功能：
 * - 日期选择（默认今天）
 * - 显示选中日期的所有 journal_entries
 * - 显示该日期的 daily summary（若有）
 * - 「生成当天总结」按钮（重新生成 = upsert）
 * - 「写日记」按钮 → CreateJournalDialog（UX-5A）
 * - JournalCard 点击展开 / 收起（一次只展开一条）
 * - 展开后显示完整 raw_content、创建时间、来源 event_id
 * - 「编辑」按钮 → EditJournalDialog（UX-5A）
 * - raw_content 永远完整显示（INV-2），ai_summary 仅作为附加
 *
 * 视觉与 Dashboard / Tasks / Inbox 统一（SoftCard / SectionHeader）
 */

import { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  Calendar,
  Sparkles,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  Pencil,
  X,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SoftCard } from "@/components/ui/soft-card";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { toast } from "sonner";
import { format } from "date-fns";
import type { JournalEntryRow, ReviewRow } from "@/types/db";
import type { Mood } from "@/types/enums";
import {
  listByDate,
  listRecent,
  createJournal,
  updateJournal,
} from "@/lib/repositories/journal-repo";
import {
  getByDate as getReviewByDate,
  parseSections,
} from "@/lib/repositories/review-repo";
import { generateDailySummary } from "@/lib/daily-summary/generator";
import { todayDate } from "@/lib/id";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 心情选项
// ---------------------------------------------------------------------------

const MOOD_OPTIONS: { value: Mood; label: string }[] = [
  { value: "unknown", label: "未标注" },
  { value: "positive", label: "积极" },
  { value: "neutral", label: "平静" },
  { value: "negative", label: "低落" },
  { value: "frustrated", label: "烦躁" },
  { value: "motivated", label: "有动力" },
];

const MOOD_LABEL: Record<string, string> = Object.fromEntries(
  MOOD_OPTIONS.map((m) => [m.value, m.label]),
);

// =========================================================================
// Page
// =========================================================================

export function JournalPage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayDate());
  const [journals, setJournals] = useState<JournalEntryRow[]>([]);
  const [recentJournals, setRecentJournals] = useState<JournalEntryRow[]>([]);
  const [review, setReview] = useState<ReviewRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  // UX-5A: 展开 / 新建 / 编辑
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<JournalEntryRow | null>(null);

  const loadData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [entries, recent, rev] = await Promise.all([
        listByDate(date),
        listRecent(5),
        getReviewByDate(date),
      ]);
      setJournals(entries);
      setRecentJournals(recent);
      setReview(rev);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("加载失败", { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(selectedDate);
  }, [selectedDate, loadData]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await generateDailySummary(selectedDate);
      if (result.ok) {
        const source = result.source === "llm" ? "LLM" : "本地模板";
        toast.success("总结已生成", {
          description: `来源：${source}${
            result.warnings.length > 0 ? `（${result.warnings.length} 个警告）` : ""
          }`,
        });
        await loadData(selectedDate);
      } else {
        toast.error("生成失败", {
          description: result.error ?? "未知错误",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("生成异常", { description: msg });
    } finally {
      setGenerating(false);
    }
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    setSelectedDate(format(d, "yyyy-MM-dd"));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + 1);
    setSelectedDate(format(d, "yyyy-MM-dd"));
  };

  const handleToday = () => setSelectedDate(todayDate());

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <PagePlaceholder
      title="日记"
      description="保留原文，也照见当天状态"
      icon={BookOpen}
      emptyHint="今天还没写日记，哪怕一句也行。"
      action={
        <div className="flex items-center gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generating}
            variant="outline"
            className="h-9"
          >
            {generating ? (
              <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            {generating ? "生成中..." : review ? "重新生成总结" : "生成当天总结"}
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="h-9">
            <Plus className="mr-1.5 h-4 w-4" />
            写日记
          </Button>
        </div>
      }
    >
      {/* 日期选择器 */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={handlePrevDay} title="前一天">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-44"
        />
        <Button variant="outline" size="icon" onClick={handleNextDay} title="后一天">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleToday}>
          今天
        </Button>
        <span className="ml-2 text-xs text-muted-foreground">
          {journals.length} 条日记
        </span>
      </div>

      {loading && (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          加载中...
        </div>
      )}

      {!loading && (
        <div className="flex flex-col gap-4 pb-12">
          {/* 当日总结 */}
          <div className="flex flex-col gap-3">
            <SectionHeader
              icon={Sparkles}
              title="当日总结"
              count={review ? 1 : 0}
            />
            <SoftCard className="p-4">
              {review ? (
                <ReviewContent review={review} />
              ) : (
                <div className="flex h-24 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground/50">
                  <Sparkles className="h-4 w-4" />
                  <span>当日无总结</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="h-7"
                  >
                    生成总结
                  </Button>
                </div>
              )}
            </SoftCard>
          </div>

          {/* 当日日记列表 */}
          <div className="flex flex-col gap-3">
            <SectionHeader
              icon={FileText}
              title={`日记列表（${selectedDate}）`}
              count={journals.length}
            />
            {journals.length === 0 ? (
              <SoftCard className="flex h-24 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground/50">
                <FileText className="h-5 w-5" strokeWidth={1.5} />
                <span>这一天没有日记</span>
              </SoftCard>
            ) : (
              <div className="flex flex-col gap-2">
                {journals.map((j) => (
                  <JournalCard
                    key={j.id}
                    journal={j}
                    expanded={expandedId === j.id}
                    onToggle={() => toggleExpand(j.id)}
                    onEdit={() => setEditTarget(j)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 最近日记 */}
          {recentJournals.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionHeader icon={Calendar} title="最近日记" />
              <div className="flex flex-wrap gap-2">
                {recentJournals.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setSelectedDate(j.entry_date)}
                    className="rounded-lg border border-border/20 bg-card/50 px-2.5 py-1.5 text-left tz-transition hover:bg-card/70 hover:border-border/30"
                  >
                    <div className="text-[10px] text-muted-foreground/70">
                      {j.entry_date}
                    </div>
                    <div className="line-clamp-1 text-xs">
                      {j.raw_content}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* UX-5A: 新建日记 Dialog */}
      {createOpen && (
        <CreateJournalDialog
          defaultDate={selectedDate}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void loadData(selectedDate);
          }}
        />
      )}

      {/* UX-5A: 编辑日记 Dialog */}
      {editTarget && (
        <EditJournalDialog
          journal={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(newDate) => {
            setEditTarget(null);
            // 编辑后若日期变了，跳转到新日期
            if (newDate && newDate !== selectedDate) {
              setSelectedDate(newDate);
            } else {
              void loadData(selectedDate);
            }
          }}
        />
      )}
    </PagePlaceholder>
  );
}

// =========================================================================
// JournalCard
// =========================================================================

function JournalCard({
  journal,
  expanded,
  onToggle,
  onEdit,
}: {
  journal: JournalEntryRow;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <SoftCard
      className={cn(
        "cursor-pointer select-none",
        expanded && "bg-card/80 border-primary/20",
      )}
      onClick={onToggle}
      title="查看日记详情"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="p-3.5">
        {/* 头部 */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[11px]">
              {MOOD_LABEL[journal.mood] ?? journal.mood}
            </Badge>
            <span className="text-xs text-muted-foreground/70">
              {format(new Date(journal.created_at), "HH:mm")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {expanded && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="h-7 px-2 text-xs"
              >
                <Pencil className="mr-1 h-3 w-3" />
                编辑
              </Button>
            )}
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground/65" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground/65" />
            )}
          </div>
        </div>

        {/* 原文 - 永远完整显示（INV-2），可读性优先 */}
        <p
          className={cn(
            "break-words text-foreground/90 whitespace-pre-wrap",
            expanded ? "text-base leading-7" : "text-sm leading-relaxed line-clamp-2",
          )}
        >
          {journal.raw_content}
        </p>

        {/* 摘要 - 作为附加字段，不替代原文（仅展开态显示） */}
        {expanded && journal.ai_summary && (
          <div className="mt-2.5 rounded-lg bg-primary/[0.04] px-3 py-2 text-sm text-muted-foreground leading-6">
            <span className="font-medium">摘要：</span>
            {journal.ai_summary}
          </div>
        )}

        {/* 标签 */}
        {expanded && journal.tags && (
          <div className="mt-2 flex flex-wrap gap-1">
            {safeParseTags(journal.tags).map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-[11px]">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {/* 展开态详情 */}
        {expanded && (
          <div className="mt-3 border-t border-border/15 pt-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="flex flex-col">
                <span className="text-muted-foreground/65">日期</span>
                <span className="text-foreground/80">{journal.entry_date}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground/65">创建时间</span>
                <span className="text-foreground/80">
                  {format(new Date(journal.created_at), "yyyy-MM-dd HH:mm:ss")}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground/65">心情</span>
                <span className="text-foreground/80">
                  {MOOD_LABEL[journal.mood] ?? journal.mood}
                </span>
              </div>
              {journal.source_event_id && (
                <div className="flex flex-col">
                  <span className="text-muted-foreground/65">来源记录</span>
                  <span className="text-foreground/80 break-all">
                    {journal.source_event_id}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </SoftCard>
  );
}

// =========================================================================
// CreateJournalDialog
// =========================================================================

function CreateJournalDialog({
  defaultDate,
  onClose,
  onCreated,
}: {
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [rawContent, setRawContent] = useState("");
  const [mood, setMood] = useState<Mood>("unknown");
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
    // 仅用 trim 做空校验，不修改原始 rawContent（INV-2：保留用户原文格式）
    if (!rawContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const journal = await createJournal({
        raw_content: rawContent,
        entry_date: entryDate,
        mood,
      });
      toast.success("日记已保存", {
        description: `${entryDate} · ${rawContent.trim().slice(0, 30)}${rawContent.trim().length > 30 ? "..." : ""}`,
      });
      onCreated();
      // 清空表单（Dialog 即将关闭，但仍清空以防残留）
      setRawContent("");
      setMood("unknown");
      void journal;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("保存失败", { description: msg });
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
              <span className="text-sm font-medium">写日记</span>
              <span className="text-[10px] text-muted-foreground/70">
                保留原文，也照见当天状态
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
          {/* 日期 + 心情 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80">
                <Calendar className="h-3 w-3" />
                日期
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground/80">
                心情
              </label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value as Mood)}
                className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {MOOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 原文内容（必填） */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80">
              内容 <span className="text-destructive">*</span>
            </label>
            <textarea
              autoFocus
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="今天发生了什么？哪怕一句也行。"
              rows={6}
              className="w-full resize-none rounded-lg border border-border/40 bg-background/60 p-3 text-[15px] leading-6 placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <span className="text-[10px] text-muted-foreground/60">
              ⌘+Enter 提交
            </span>
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
              disabled={submitting || !rawContent.trim()}
              className="h-9"
            >
              {submitting ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              {submitting ? "保存中..." : "保存日记"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// EditJournalDialog
// =========================================================================

function EditJournalDialog({
  journal,
  onClose,
  onSaved,
}: {
  journal: JournalEntryRow;
  onClose: () => void;
  onSaved: (newDate?: string) => void;
}) {
  const [entryDate, setEntryDate] = useState(journal.entry_date);
  const [rawContent, setRawContent] = useState(journal.raw_content);
  const [mood, setMood] = useState<Mood>(journal.mood);
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
    // 仅用 trim 做空校验，不修改原始 rawContent（INV-2：保留用户原文格式）
    if (!rawContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const updated = await updateJournal(journal.id, {
        raw_content: rawContent,
        entry_date: entryDate,
        mood,
      });
      if (!updated) {
        toast.error("保存失败", { description: "日记不存在或更新失败" });
        return;
      }
      toast.success("日记已更新", {
        description: `${entryDate} · ${rawContent.trim().slice(0, 30)}${rawContent.trim().length > 30 ? "..." : ""}`,
      });
      onSaved(entryDate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("保存失败", { description: msg });
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
              <Pencil className="h-4 w-4" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-medium">编辑日记</span>
              <span className="text-[10px] text-muted-foreground/70">
                创建于 {format(new Date(journal.created_at), "yyyy-MM-dd HH:mm")}
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
          {/* 日期 + 心情 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground/80">
                <Calendar className="h-3 w-3" />
                日期
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground/80">
                心情
              </label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value as Mood)}
                className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {MOOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 原文内容（必填） */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80">
              内容 <span className="text-destructive">*</span>
            </label>
            <textarea
              autoFocus
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="今天发生了什么？哪怕一句也行。"
              rows={6}
              className="w-full resize-none rounded-lg border border-border/40 bg-background/60 p-3 text-[15px] leading-6 placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <span className="text-[10px] text-muted-foreground/60">
              ⌘+Enter 提交
            </span>
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
              disabled={submitting || !rawContent.trim()}
              className="h-9"
            >
              {submitting ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
              )}
              {submitting ? "保存中..." : "保存修改"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// ReviewContent - 当日总结内容（内联展示）
// =========================================================================

function ReviewContent({ review }: { review: ReviewRow }) {
  const sections = parseSections(review.sections);
  return (
    <div>
      <div className="whitespace-pre-wrap break-words text-sm text-foreground/90 leading-relaxed">
        {review.raw_content}
      </div>

      {sections && (
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/15 pt-3 sm:grid-cols-2">
          {sections.wins && sections.wins.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5">
              <div className="mb-1 text-xs font-medium text-emerald-400">
                做成（{sections.wins.length}）
              </div>
              <ul className="ml-4 list-disc text-xs text-muted-foreground leading-relaxed">
                {sections.wins.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {sections.delays && sections.delays.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2.5">
              <div className="mb-1 text-xs font-medium text-amber-400">
                拖延（{sections.delays.length}）
              </div>
              <ul className="ml-4 list-disc text-xs text-muted-foreground leading-relaxed">
                {sections.delays.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {sections.topNext && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-2.5">
              <div className="mb-1 text-xs font-medium text-sky-400">明天最重要</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {sections.topNext}
              </p>
            </div>
          )}
          {sections.improvement && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-2.5">
              <div className="mb-1 text-xs font-medium text-violet-400">改进建议</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {sections.improvement}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 text-[11px] text-muted-foreground/65">
        生成于 {format(new Date(review.created_at), "yyyy-MM-dd HH:mm")}
      </div>
    </div>
  );
}

// =========================================================================
// 辅助
// =========================================================================

function safeParseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
