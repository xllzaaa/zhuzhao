import { useEffect, useRef, useState } from "react";
import {
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
  Flame,
  ChevronDown,
  Archive,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/stores/app-store";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export function ChatSidebar() {
  const open = useAppStore((s) => s.chatSidebarOpen);
  const toggle = useAppStore((s) => s.toggleChatSidebar);
  const {
    currentConversation,
    messages,
    conversations,
    loading,
    error,
    intakePending,
    init,
    sendMessage,
    newConversation,
    selectConversation,
  } = useChatStore();
  const [input, setInput] = useState("");
  // 自动滚动逻辑必须保留：ScrollArea ref + querySelector 拿 viewport
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // 挂载时加载会话
  useEffect(() => {
    init();
  }, [init]);

  // 自动滚动到底部：5 个触发场景不变
  // 1. 用户发送消息后 2. assistant 回复追加后 3. intakePending 变化
  // 4. scheduler 插入 [烛照追问] 后 5. 切换 conversation 后
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;
    const rafId = requestAnimationFrame(() => {
      const viewport = scrollArea.querySelector(
        "[data-radix-scroll-area-viewport]",
      ) as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    messages.length,
    intakePending,
    currentConversation?.id,
  ]);

  // 折叠态：竖条 + 烛光圆点
  if (!open) {
    return (
      <button
        onClick={toggle}
        title="展开对话 (⌘B)"
        className="group relative flex h-full w-10 flex-col items-center justify-center gap-2 bg-chat-layer text-muted-foreground hover:text-foreground tz-transition"
      >
        <span className="absolute left-0 top-1/4 h-1/2 w-px bg-gradient-to-b from-transparent via-border/40 to-transparent" />
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary/15">
          <PanelRightOpen className="h-4 w-4" />
        </div>
        <span className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">
          对话
        </span>
      </button>
    );
  }

  const handleSend = async () => {
    if (!input.trim()) return;
    const content = input;
    setInput("");
    await sendMessage(content);
  };

  return (
    <aside className="relative flex h-full w-80 flex-col bg-chat-layer">
      {/* 左侧渐变细线，替代硬 border */}
      <span className="absolute left-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-border/30 to-transparent" />

      {/* ===== 顶部 Header（h-14） ===== */}
      <header className="relative flex h-14 items-center justify-between px-4">
        <div className="flex min-w-0 flex-col leading-tight">
          {/* 主标题 + 当前会话下拉合并 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="group flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-left hover:bg-accent/40 tz-transition disabled:opacity-40"
                disabled={loading}
              >
                <span className="text-sm font-semibold tracking-tight text-foreground">
                  烛照
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {conversations.length === 0 && (
                <DropdownMenuItem disabled>暂无会话</DropdownMenuItem>
              )}
              {conversations.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={cn(
                    c.id === currentConversation?.id && "bg-accent/60",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="truncate text-xs">
                      {c.title ?? "和烛照对话"}
                    </span>
                    <span className="text-[10px] text-muted-foreground/70">
                      {format(new Date(c.updated_at), "MM-dd HH:mm")}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {/* 副标题：随时记录，随时追问 */}
          <span className="mt-0.5 text-[10px] text-muted-foreground/60">
            {currentConversation?.title ?? "随时记录，随时追问"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => newConversation(null)}
            title="新对话"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/30 text-muted-foreground hover:bg-accent/60 hover:text-foreground tz-transition"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            onClick={toggle}
            title="折叠 (⌘B)"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/30 text-muted-foreground hover:bg-accent/60 hover:text-foreground tz-transition"
          >
            <PanelRightClose className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* ===== 错误提示 - 极弱 ===== */}
      {error && (
        <div className="mx-3 mb-2 flex items-center gap-1.5 rounded-lg bg-destructive/[0.06] px-2.5 py-1.5 text-[10px] text-destructive/80">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* ===== 消息流 - 适度呼吸感，不过分稀疏 ===== */}
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="flex flex-col gap-4 px-3 py-4">
          {messages.length === 0 && !loading && (
            <EmptyState />
          )}
          {loading && messages.length === 0 && (
            <div className="mt-12 flex justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {intakePending && (
            <div className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground/60">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              烛照正在思考...
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ===== Floating Composer ===== */}
      <div className="px-3 pb-3 pt-1">
        <div className="group relative flex items-end gap-2 rounded-2xl bg-card/70 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur-md ring-1 ring-inset ring-border/20 transition-all duration-200 focus-within:ring-primary/30 focus-within:shadow-primary/[0.06]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="记录一下，或直接说你卡住了什么…"
            rows={1}
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
            onKeyDown={(e) => {
              // 中文输入法 composing 状态下 Enter 不发送（避免选词时误触发）
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              } else if (e.key === "Enter" && !e.shiftKey) {
                // Enter 发送，Shift+Enter 换行
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            title="发送 (Enter)"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 transition-all duration-200 hover:bg-primary/90 hover:shadow-primary/40 active:scale-90 disabled:pointer-events-none disabled:opacity-30 disabled:saturate-50"
            aria-label="发送"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </aside>
  );
}

// =========================================================================
// 空态：今天想先照见哪件事？
// =========================================================================
function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-center justify-center gap-4 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/[0.08]">
        <Flame
          className="h-6 w-6 text-primary/70"
          strokeWidth={1.5}
        />
        <span className="absolute -bottom-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-primary/20 blur-[2px]" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground/90">
          今天想先照见哪件事？
        </p>
        <p className="max-w-[220px] text-[11px] leading-relaxed text-muted-foreground/60">
          记录任务、日记、灵感，或者直接说你卡住了什么。
        </p>
      </div>
    </div>
  );
}

// =========================================================================
// 消息气泡：Premium 风格
// =========================================================================
function MessageBubble({
  message,
}: {
  message: {
    id: string;
    role: string;
    content: string;
    created_at: string;
    event_id: string | null;
  };
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  // scheduler 触发的追问消息以「[烛照追问]」开头
  const isSupervisorFollowUp =
    !isUser && !isSystem && message.content.startsWith("[烛照追问]");

  const displayContent = isSupervisorFollowUp
    ? message.content.replace(/^\[烛照追问\]\s*/, "")
    : message.content;

  const time = format(new Date(message.created_at), "HH:mm");
  const setPage = useAppStore((s) => s.setPage);

  // ---- 系统消息：弱化为居中小胶囊 ----
  if (isSystem) {
    return (
      <div className="flex animate-slide-in justify-center">
        <span className="rounded-full bg-muted/40 px-3 py-1 text-[10px] text-muted-foreground/70">
          {displayContent}
        </span>
      </div>
    );
  }

  // ---- 用户 / AI / 烛照追问 ----
  // 关键修复：不再用 flex flex-col + items-end/items-start（会让气泡收缩到 min-content，
  // 叠加 whitespace-pre-wrap 会让中文一字一行）。改为 block + 自身 max-w/min-w + ml-auto 控制对齐。
  return (
    <div className="animate-slide-in flex flex-col gap-1">
      <div
        className={cn(
          // w-fit 让气泡贴合内容，max-w 限制长消息换行，min-w 保证短消息不挤成竖排
          "w-fit max-w-[240px] min-w-[80px] px-4 py-2.5 text-sm whitespace-pre-wrap break-words leading-relaxed",
          isUser
            ? "ml-auto rounded-2xl rounded-br-sm bg-primary/10 text-foreground"
            : isSupervisorFollowUp
              ? "rounded-2xl rounded-bl-sm bg-card/60 text-foreground border-l-2 border-amber-400/60 pl-3"
              : "rounded-2xl rounded-bl-sm bg-card/60 text-foreground",
        )}
      >
        {isSupervisorFollowUp && (
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-amber-400/80">
            <Flame className="h-2.5 w-2.5" strokeWidth={2} />
            烛照追问
          </div>
        )}
        {displayContent}
        {/* 烛照追问 - 轻量「去处理」按钮，跳任务页处理 */}
        {isSupervisorFollowUp && (
          <button
            onClick={() => setPage("tasks")}
            className="mt-1.5 inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300/90 hover:bg-amber-500/15 hover:text-amber-200 tz-transition"
            aria-label="去任务页处理"
            title="去任务页处理"
          >
            去处理
            <ArrowRight className="h-2.5 w-2.5" strokeWidth={2} />
          </button>
        )}
      </div>
      {/* 时间戳 + 已存档（弱化） */}
      <div
        className={cn(
          "flex items-center gap-1 px-1 text-[9px] text-muted-foreground/40",
          isUser ? "justify-end" : "justify-start",
        )}
      >
        <span>{time}</span>
        {message.event_id && (
          <button
            onClick={() => setPage("inbox")}
            title="查看关联记录"
            aria-label="查看关联记录"
            className="inline-flex items-center gap-0.5 rounded-sm px-0.5 hover:text-muted-foreground/70 tz-transition cursor-pointer"
          >
            · <Archive className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}
