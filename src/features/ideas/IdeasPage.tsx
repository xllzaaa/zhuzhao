/**
 * Ideas Page - 灵感页（UX-7A 补全）
 *
 * 功能：
 * - 灵感列表（按创建时间倒序，listRecent(50)）
 * - 顶部说明卡：灵感不等于任务，先保存
 * - 「记录灵感」按钮 → CreateIdeaDialog
 * - IdeaCard 点击展开 / 收起（一次只展开一条）
 * - 展开后显示完整 raw_content、创建时间、更新时间、来源记录
 * - 「编辑」按钮 → EditIdeaDialog（stopPropagation）
 *
 * 视觉与 Dashboard / Inbox / Journal 统一（SoftCard / SectionHeader / Badge）
 */

import { useEffect, useState, useCallback } from "react";
import {
  Lightbulb,
  Plus,
  Pencil,
  X,
  RefreshCw,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SoftCard } from "@/components/ui/soft-card";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge } from "@/components/ui/badge";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { toast } from "sonner";
import { format } from "date-fns";
import type { IdeaRow } from "@/types/db";
import type { IdeaStatus } from "@/types/enums";
import {
  listRecent,
  createIdea,
  updateIdea,
} from "@/lib/repositories/idea-repo";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 状态选项与标签
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: IdeaStatus; label: string }[] = [
  { value: "inbox", label: "收集中" },
  { value: "refined", label: "已提炼" },
  { value: "linked", label: "已关联" },
  { value: "archived", label: "已归档" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

const STATUS_CLASS: Record<string, string> = {
  inbox: "bg-amber-500/12 text-amber-300 border-amber-500/25",
  refined: "bg-sky-400/12 text-sky-300 border-sky-400/25",
  linked: "bg-violet-500/12 text-violet-300 border-violet-500/25",
  archived: "bg-zinc-500/12 text-zinc-400 border-zinc-500/25",
};

// =========================================================================
// Page
// =========================================================================

export function IdeasPage() {
  const [ideas, setIdeas] = useState<IdeaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<IdeaRow | null>(null);

  const reloadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listRecent(50);
      setIdeas(rows);
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

  return (
    <PagePlaceholder
      title="灵感"
      description="先收起来，之后再筛选和推进"
      icon={Lightbulb}
      emptyHint="灵感还没出现，它来的时候记下来就行。"
      action={
        <Button onClick={() => setCreateOpen(true)} className="h-9">
          <Plus className="mr-1.5 h-4 w-4" />
          记录灵感
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-12">
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3 text-xs text-destructive/90">
            加载失败：{error}
          </div>
        )}

        {/* 顶部说明卡 */}
        <SoftCard className="flex items-start gap-3 p-3.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm leading-relaxed text-foreground/90">
              灵感不等于任务，先保存，之后再判断是否值得推进。
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              可以是一句话、一个想法、一个待验证的假设。
            </p>
          </div>
        </SoftCard>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            加载中...
          </div>
        ) : ideas.length === 0 ? (
          <SoftCard className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Lightbulb className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-muted-foreground">
              灵感还没出现，它来的时候记下来就行。
            </p>
          </SoftCard>
        ) : (
          <div className="flex flex-col gap-3">
            <SectionHeader
              icon={Lightbulb}
              title="灵感列表"
              count={ideas.length}
            />
            <div className="flex flex-col gap-2">
              {ideas.map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  expanded={expandedId === idea.id}
                  onToggle={() => toggleExpand(idea.id)}
                  onEdit={() => setEditTarget(idea)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 新建灵感 Dialog */}
      {createOpen && (
        <CreateIdeaDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void reloadData();
          }}
        />
      )}

      {/* 编辑灵感 Dialog */}
      {editTarget && (
        <EditIdeaDialog
          idea={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void reloadData();
          }}
        />
      )}
    </PagePlaceholder>
  );
}

// =========================================================================
// IdeaCard
// =========================================================================

function IdeaCard({
  idea,
  expanded,
  onToggle,
  onEdit,
}: {
  idea: IdeaRow;
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
      title="查看灵感详情"
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
        {/* 头部：标题 + 状态 + 展开箭头 */}
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium truncate leading-snug">
              {idea.title}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            <Badge
              variant="outline"
              className={cn("text-[10px]", STATUS_CLASS[idea.status] ?? STATUS_CLASS.inbox)}
            >
              {STATUS_LABEL[idea.status] ?? idea.status}
            </Badge>
            {expanded && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="h-7 px-2 text-[11px]"
              >
                <Pencil className="mr-1 h-3 w-3" />
                编辑
              </Button>
            )}
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
          </div>
        </div>

        {/* 内容 - 永远完整保存（INV-2），折叠态截断 */}
        <p
          className={cn(
            "text-sm break-words leading-relaxed text-foreground/90 whitespace-pre-wrap",
            !expanded && "line-clamp-2",
          )}
        >
          {idea.raw_content}
        </p>

        {/* 折叠态 meta 行 */}
        {!expanded && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
            <span>· 创建于 {format(new Date(idea.created_at), "MM-dd HH:mm")}</span>
          </div>
        )}

        {/* 展开态详情 */}
        {expanded && (
          <div className="mt-3 border-t border-border/15 pt-3">
            {/* 完整内容 */}
            <div className="mb-3 rounded-lg bg-background/40 p-2.5">
              <div className="mb-1 text-[11px] text-muted-foreground/60">
                完整内容
              </div>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                {idea.raw_content}
              </p>
            </div>

            {/* 摘要（若有） */}
            {idea.summary && (
              <div className="mb-3 rounded-lg bg-primary/[0.04] px-2.5 py-1.5 text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium">摘要：</span>
                {idea.summary}
              </div>
            )}

            {/* 详情 grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              <div className="flex flex-col">
                <span className="text-muted-foreground/60">状态</span>
                <span className="text-foreground/80">
                  {STATUS_LABEL[idea.status] ?? idea.status}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground/60">创建时间</span>
                <span className="text-foreground/80">
                  {format(new Date(idea.created_at), "yyyy-MM-dd HH:mm:ss")}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground/60">更新时间</span>
                <span className="text-foreground/80">
                  {format(new Date(idea.updated_at), "yyyy-MM-dd HH:mm:ss")}
                </span>
              </div>
              {idea.source_event_id && (
                <div className="flex flex-col">
                  <span className="text-muted-foreground/60">来源记录</span>
                  <span className="text-foreground/80 break-all">
                    {idea.source_event_id}
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
// CreateIdeaDialog
// =========================================================================

function CreateIdeaDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [status, setStatus] = useState<IdeaStatus>("inbox");
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
    // 仅用 trim 做空校验，不修改原始内容（保留用户格式）
    if (!title.trim() || !rawContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const idea = await createIdea({
        title: title.trim(), // title 是单行，可以 trim
        raw_content: rawContent, // 完整保存，不 trim
        status,
      });
      toast.success("灵感已记录", {
        description: idea.title,
      });
      onCreated();
      // 清空表单
      setTitle("");
      setRawContent("");
      setStatus("inbox");
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
              <span className="text-sm font-medium">记录灵感</span>
              <span className="text-[10px] text-muted-foreground/70">
                先收起来，之后再筛选
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
              placeholder="一句话概括这个灵感"
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

          {/* 内容（必填） */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80">
              内容 <span className="text-destructive">*</span>
            </label>
            <textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="详细写下来，可以是想法、假设、观察..."
              rows={6}
              className="w-full resize-none rounded-lg border border-border/40 bg-background/60 p-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
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

          {/* 状态 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80">
              状态
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IdeaStatus)}
              className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
              disabled={submitting || !title.trim() || !rawContent.trim()}
              className="h-9"
            >
              {submitting ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              {submitting ? "保存中..." : "保存灵感"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// EditIdeaDialog
// =========================================================================

function EditIdeaDialog({
  idea,
  onClose,
  onSaved,
}: {
  idea: IdeaRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(idea.title);
  const [rawContent, setRawContent] = useState(idea.raw_content);
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
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
    // 仅用 trim 做空校验，不修改原始内容（保留用户格式）
    if (!title.trim() || !rawContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const updated = await updateIdea(idea.id, {
        title: title.trim(), // title 是单行，可以 trim
        raw_content: rawContent, // 完整保存，不 trim
        status,
      });
      if (!updated) {
        toast.error("保存失败", { description: "灵感不存在或更新失败" });
        return;
      }
      toast.success("灵感已更新", {
        description: updated.title,
      });
      onSaved();
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
              <span className="text-sm font-medium">编辑灵感</span>
              <span className="text-[10px] text-muted-foreground/70">
                创建于 {format(new Date(idea.created_at), "yyyy-MM-dd HH:mm")}
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
              placeholder="一句话概括这个灵感"
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

          {/* 内容（必填） */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80">
              内容 <span className="text-destructive">*</span>
            </label>
            <textarea
              value={rawContent}
              onChange={(e) => setRawContent(e.target.value)}
              placeholder="详细写下来，可以是想法、假设、观察..."
              rows={6}
              className="w-full resize-none rounded-lg border border-border/40 bg-background/60 p-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
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

          {/* 状态 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground/80">
              状态
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IdeaStatus)}
              className="h-10 w-full rounded-lg border border-border/40 bg-background/60 px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
              disabled={submitting || !title.trim() || !rawContent.trim()}
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
