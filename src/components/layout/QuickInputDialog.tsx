/**
 * 全局快速记录 Dialog（Premium · Raycast command dialog 风格）
 * 通过 ⌘+I / Ctrl+I 唤起
 * 提交后：
 *   1. 创建 Event(source='quick_input')
 *   2. 异步触发 LLM Intake
 *   3. UI 立即关闭并提示「已记录」
 *   4. Intake 完成后再 toast 一次结果
 */

import { useEffect, useState } from "react";
import { Flame, Command } from "lucide-react";
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
      toast.success("已记录", { description: "输入已保存到收集箱" });
      setValue("");
      setOpen(false);
      // 2. 异步触发 LLM Intake（不阻塞 UI）
      runIntake(event, null)
        .then((result) => {
          if (result.success) {
            toast.success("已整理", { description: result.summary });
          } else {
            toast.warning("整理未完成", { description: result.summary });
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 backdrop-blur-md"
      onClick={() => setOpen(false)}
    >
      <div
        className="mt-[18vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-border/20 bg-card/80 shadow-2xl shadow-black/40 backdrop-blur-2xl tz-transition"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== 头部：烛照标识 + 标题 + 副标题 ===== */}
        <div className="flex items-start gap-3.5 px-6 pt-6 pb-4">
          <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <Flame className="h-5 w-5 text-primary" strokeWidth={1.6} />
            <span className="absolute -bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-primary/20 blur-[2px]" />
          </div>
          <div className="flex flex-1 flex-col gap-0.5 leading-tight">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              快速记录
            </h2>
            <p className="text-[11px] text-muted-foreground/70">
              任务、日记、灵感，都可以先扔给烛照。
            </p>
          </div>
          <div className="mt-0.5 flex items-center gap-1 rounded-md bg-muted/40 px-1.5 py-1 text-[10px] text-muted-foreground/70">
            <Command className="h-2.5 w-2.5" />
            ESC
          </div>
        </div>

        {/* ===== 输入区 ===== */}
        <div className="px-6 pb-4">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="想到什么就写下来，烛照会帮你整理…"
            className="h-32 w-full resize-none rounded-2xl border border-border/20 bg-background/40 p-4 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 transition-all duration-200 focus:border-primary/30 focus:bg-background/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground/50">
            <span className="flex items-center gap-1">
              <Command className="h-2.5 w-2.5" />+ Enter 提交
            </span>
            <span>{value.length} 字</span>
          </div>
        </div>

        {/* ===== 底部按钮 ===== */}
        <div className="flex items-center justify-end gap-2 border-t border-border/20 bg-muted/[0.15] px-6 py-4">
          <button
            onClick={() => setOpen(false)}
            className="rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground tz-transition"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || submitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-200 hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:saturate-50"
          >
            <Flame className="h-3 w-3" strokeWidth={2.2} />
            {submitting ? "提交中..." : "交给烛照"}
          </button>
        </div>
      </div>
    </div>
  );
}
