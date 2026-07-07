import { useEffect, useState } from "react";
import {
  ClipboardList,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { SoftCard } from "@/components/ui/soft-card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  listRecent,
  parseSections,
} from "@/lib/repositories/review-repo";
import { generateDailySummary } from "@/lib/daily-summary/generator";
import type { ReviewRow } from "@/types/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reloadData = () =>
    listRecent(30)
      .then(setReviews)
      .catch((err) => setError(err?.message ?? String(err)))
      .finally(() => setLoading(false));

  useEffect(() => {
    reloadData();
  }, []);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await generateDailySummary();
      if (result.ok) {
        const source = result.source === "llm" ? "AI 引擎" : "本地模板";
        toast.success("今日总结已生成", {
          description: `来源：${source}${
            result.warnings.length > 0
              ? `（${result.warnings.length} 个警告）`
              : ""
          }`,
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
      setGenerating(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <PagePlaceholder
      title="总结"
      description="复盘每天的推进、拖延和下一步"
      icon={ClipboardList}
      emptyHint="还没有总结，今天结束时生成一个。"
      action={
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="h-9"
        >
          {generating ? (
            <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {generating ? "生成中..." : "生成今日总结"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-12">
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3 text-xs text-destructive/90">
            加载失败：{error}
          </div>
        )}

        {loading && (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            加载中...
          </div>
        )}

        {!loading && reviews.length === 0 && !error && (
          <EmptyState onGenerate={handleGenerate} generating={generating} />
        )}

        {!loading && reviews.length > 0 && (
          <div className="flex flex-col gap-3">
            <SectionHeader
              icon={ClipboardList}
              title="历史总结"
              count={reviews.length}
            />
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                expanded={expandedId === review.id}
                onToggle={() => toggleExpand(review.id)}
              />
            ))}
          </div>
        )}
      </div>
    </PagePlaceholder>
  );
}

// =========================================================================
// 空状态
// =========================================================================

function EmptyState({
  onGenerate,
  generating,
}: {
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <SoftCard className="flex flex-col items-center gap-4 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ClipboardList className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold">还没有总结</h3>
        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
          生成一份今日总结，让烛照帮你复盘今天。
        </p>
      </div>
      <Button onClick={onGenerate} disabled={generating} className="mt-2">
        {generating ? (
          <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-1.5 h-4 w-4" />
        )}
        {generating ? "生成中..." : "生成今日总结"}
      </Button>
    </SoftCard>
  );
}

// =========================================================================
// 总结卡片
// =========================================================================

function ReviewCard({
  review,
  expanded,
  onToggle,
}: {
  review: ReviewRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sections = parseSections(review.sections);
  const date = review.review_date;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(
    today.getMonth() + 1,
  ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const isToday = date === todayStr;

  // 摘要：raw_content 第一段或前 120 字
  const summary = review.raw_content.split("\n")[0]?.slice(0, 120) ?? "";

  return (
    <SoftCard
      className={cn(
        "p-5 tz-transition cursor-pointer hover:bg-card/70 hover:border-border/30",
      )}
      onClick={onToggle}
      title="查看完整总结"
      role="button"
    >
      {/* 顶部：日期 + 今日标签 + 展开图标 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-base font-semibold tabular-nums">{date}</h4>
          {isToday && (
            <span className="inline-flex h-5 items-center rounded-full bg-emerald-500/15 px-2 text-[11px] font-medium leading-none text-emerald-300/90">
              今日
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground/60" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground/60" />
        )}
      </div>

      {/* 摘要 */}
      <p className="mt-2 text-sm leading-relaxed text-foreground/85 line-clamp-2">
        {summary || "（无摘要）"}
      </p>

      {/* sections 关键内容 */}
      {sections && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <SectionItem
            icon={CheckCircle2}
            label="做成了什么"
            items={sections.wins}
            tone="emerald"
          />
          <SectionItem
            icon={AlertCircle}
            label="拖延了什么"
            items={sections.delays}
            tone="amber"
          />
          <SectionItem
            icon={ArrowRight}
            label="明天最重要"
            text={sections.topNext}
            tone="sky"
          />
          <SectionItem
            icon={Lightbulb}
            label="改进建议"
            text={sections.improvement}
            tone="zinc"
          />
        </div>
      )}

      {/* 展开后显示完整 raw_content */}
      {expanded && (
        <div className="mt-4 border-t border-border/20 pt-3">
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground/70">
            完整总结
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            {review.raw_content}
          </p>
        </div>
      )}
    </SoftCard>
  );
}

// =========================================================================
// Section 项（单条 section 展示）
// =========================================================================

function SectionItem({
  icon: Icon,
  label,
  items,
  text,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  items?: string[];
  text?: string;
  tone: "emerald" | "amber" | "sky" | "zinc";
}) {
  const hasContent =
    (items && items.length > 0) || (text && text.trim().length > 0);

  const toneClass = {
    emerald: "border-emerald-500/20 bg-emerald-500/[0.04]",
    amber: "border-amber-500/20 bg-amber-500/[0.04]",
    sky: "border-sky-500/20 bg-sky-500/[0.04]",
    zinc: "border-border/20 bg-muted/20",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        toneClass,
        !hasContent && "opacity-50",
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/80">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      {hasContent ? (
        items && items.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {items.map((item, idx) => (
              <li
                key={idx}
                className="text-xs leading-relaxed text-foreground/85"
              >
                · {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs leading-relaxed text-foreground/85">{text}</p>
        )
      ) : (
        <p className="text-xs text-muted-foreground/50">—</p>
      )}
    </div>
  );
}
