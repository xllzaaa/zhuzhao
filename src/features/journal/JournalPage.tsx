/**
 * Journal Page - Phase 7
 *
 * 接入真实 journal_entries 数据。
 *
 * 功能：
 * - 日期选择（默认今天）
 * - 显示选中日期的所有 journal_entries（raw_content + ai_summary + mood + tags + source_event_id + created_at）
 * - 显示该日期的 daily summary（若有）
 * - "生成当天总结"按钮（重新生成 = upsert）
 * - raw_content 永远完整显示（INV-2），ai_summary 仅作为附加
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { toast } from "sonner";
import { format } from "date-fns";
import type { JournalEntryRow, ReviewRow } from "@/types/db";
import { listByDate, listRecent } from "@/lib/repositories/journal-repo";
import {
  getByDate as getReviewByDate,
  parseSections,
} from "@/lib/repositories/review-repo";
import { generateDailySummary } from "@/lib/daily-summary/generator";
import { todayDate } from "@/lib/id";

export function JournalPage() {
  const [selectedDate, setSelectedDate] = useState<string>(todayDate());
  const [journals, setJournals] = useState<JournalEntryRow[]>([]);
  const [recentJournals, setRecentJournals] = useState<JournalEntryRow[]>([]);
  const [review, setReview] = useState<ReviewRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

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
        const source =
          result.source === "llm" ? "LLM" : "本地模板";
        toast.success("总结已生成", {
          description: `来源：${source}${result.warnings.length > 0 ? `（${result.warnings.length} 个警告）` : ""}`,
        });
        // 重新加载
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

  return (
    <PagePlaceholder
      title="日记"
      description="保留原文，也照见当天状态"
      icon={BookOpen}
      emptyHint="今天还没写日记，哪怕一句也行。"
      action={
        <Button
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {generating ? "生成中..." : review ? "重新生成总结" : "生成当天总结"}
        </Button>
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
        <div className="grid gap-4 md:grid-cols-3">
          {/* 当日总结（左栏，跨 1 行） */}
          <Card className="p-4 md:col-span-1">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              当日总结（{selectedDate}）
            </h3>
            {review ? (
              <ReviewCard review={review} />
            ) : (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground/50">
                <Sparkles className="h-4 w-4" />
                <span>当日无总结</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  生成总结
                </Button>
              </div>
            )}
          </Card>

          {/* 当日日记列表（中栏，跨 2 列） */}
          <Card className="p-4 md:col-span-2">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="h-3 w-3" />
              日记列表（{selectedDate}）
            </h3>
            <ScrollArea className="h-[calc(100vh-280px)] min-h-80">
              {journals.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-xs text-muted-foreground/50">
                  <FileText className="h-5 w-5" strokeWidth={1.5} />
                  <span>这一天没有日记</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3 pr-2">
                  {journals.map((j) => (
                    <JournalCard key={j.id} journal={j} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>

          {/* 最近日记（底部） */}
          <Card className="p-4 md:col-span-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="h-3 w-3" />
              最近日记
            </h3>
            {recentJournals.length === 0 ? (
              <div className="text-xs text-muted-foreground/50">暂无</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recentJournals.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setSelectedDate(j.entry_date)}
                    className="rounded border border-border px-2 py-1 text-left hover:bg-accent/50"
                  >
                    <div className="text-[10px] text-muted-foreground">
                      {j.entry_date}
                    </div>
                    <div className="line-clamp-1 text-xs">
                      {j.raw_content}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </PagePlaceholder>
  );
}

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

function JournalCard({ journal }: { journal: JournalEntryRow }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/80 p-3.5 tz-transition">
      {/* 头部：心情 + 时间 */}
      <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground/80">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {journal.mood || "未标注"}
          </Badge>
          {journal.source_event_id && (
            <span title={`来源记录 ID：${journal.source_event_id}`}>
              · 来源记录
            </span>
          )}
        </div>
        <span>{format(new Date(journal.created_at), "HH:mm:ss")}</span>
      </div>

      {/* 原文 - 永远完整显示（INV-2） */}
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {journal.raw_content}
      </div>

      {/* 摘要 - 作为附加字段，不替代原文 */}
      {journal.ai_summary && (
        <div className="mt-2.5 rounded-lg bg-primary/[0.04] px-2.5 py-1.5 text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium">摘要：</span>
          {journal.ai_summary}
        </div>
      )}

      {/* 标签 */}
      {journal.tags && (
        <div className="mt-2 flex flex-wrap gap-1">
          {safeParseTags(journal.tags).map((tag, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              #{tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewRow }) {
  const sections = parseSections(review.sections);
  return (
    <ScrollArea className="h-[calc(100vh-340px)] min-h-60">
      <div className="whitespace-pre-wrap break-words text-xs text-foreground/90">
        {review.raw_content}
      </div>

      {sections && (
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-border/40 pt-3 text-[11px] sm:grid-cols-2">
          {sections.wins && sections.wins.length > 0 && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2">
              <div className="font-medium text-emerald-400">做成（{sections.wins.length}）</div>
              <ul className="ml-3 list-disc text-muted-foreground leading-relaxed">
                {sections.wins.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {sections.delays && sections.delays.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2">
              <div className="font-medium text-amber-400">拖延（{sections.delays.length}）</div>
              <ul className="ml-3 list-disc text-muted-foreground leading-relaxed">
                {sections.delays.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {sections.topNext && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-2">
              <div className="font-medium text-sky-400">明天最重要</div>
              <p className="text-muted-foreground leading-relaxed">{sections.topNext}</p>
            </div>
          )}
          {sections.improvement && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-2">
              <div className="font-medium text-violet-400">改进建议</div>
              <p className="text-muted-foreground leading-relaxed">{sections.improvement}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 text-[9px] text-muted-foreground/60">
        生成于 {format(new Date(review.created_at), "yyyy-MM-dd HH:mm")}
      </div>
    </ScrollArea>
  );
}

function safeParseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
