/**
 * 全局快速输入 Dialog
 * 通过 ⌘+I / Ctrl+I 唤起
 * 提交后：
 *   1. 创建 Event(source='quick_input')
 *   2. 异步触发 LLM Intake
 *   3. UI 立即关闭并提示「已记录」
 *   4. Intake 完成后再 toast 一次结果
 */

import { useEffect, useState } from "react";
import { Zap, X } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { createEvent } from "@/lib/repositories/event-repo";
import { runIntake } from "@/lib/intake/run-intake";
import { toast } from "sonner";

export function QuickInputDialog() {
  const open = useAppStore((s) => s.quickInputOpen);
  const setOpen = useAppStore((s) => s.setQuickInputOpen);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // open 变化时清空
  useEffect(() => {
    if (open) {
      setValue("");
    }
  }, [open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  if (!open) return null;

  const handleSubmit = async () => {
    const trimmed = value.trim();
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
      setValue("");
      setOpen(false);
      // 2. 异步触发 LLM Intake（不阻塞 UI）
      runIntake(event, null)
        .then((result) => {
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="mt-32 w-full max-w-2xl rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Zap className="h-4 w-4 text-primary" />
            快速输入
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 输入区 */}
        <div className="p-4">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="想到什么就写什么。烛照会帮你判断要做什么。"
            className="h-32 w-full resize-none rounded-md border border-border bg-background p-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>⌘+Enter 提交 · ESC 关闭</span>
            <span>{value.length} 字</span>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex justify-end gap-2 border-t border-border px-4 py-2">
          <button
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || submitting}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
          >
            <Zap className="h-3 w-3" />
            {submitting ? "提交中..." : "提交"}
          </button>
        </div>
      </div>
    </div>
  );
}
