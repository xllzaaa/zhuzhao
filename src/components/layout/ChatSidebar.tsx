import { useEffect, useRef, useState } from "react";
import {
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  // Phase 6 验收反馈修订：用 ScrollArea 根 ref + querySelector 拿 viewport
  // shadcn ScrollArea 的实际滚动元素是 Viewport（带 data-radix-scroll-area-viewport 属性）
  // 旧的 scrollRef 指向 ScrollArea 内部 div，scrollTo 没作用到 viewport 上
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // 挂载时加载会话
  useEffect(() => {
    init();
  }, [init]);

  // 自动滚动到底部：覆盖 5 个触发场景
  // 1. 用户发送消息后（messages.length 增加）
  // 2. assistant 回复追加后（messages.length 增加）
  // 3. intakePending 开始/结束后（intakePending 变化）
  // 4. scheduler 插入 [烛照追问] 消息后（messages.length 增加，由 use-supervision-scheduler 通过 setState 触发）
  // 5. 切换 conversation 后（currentConversation.id 变化）
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;
    // 用 requestAnimationFrame 确保 DOM 已完成更新
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

  // 折叠态：加 hover 提示文字（更友好）
  if (!open) {
    return (
      <button
        onClick={toggle}
        title="展开对话 (⌘B)"
        className="group flex h-full w-10 flex-col items-center justify-center gap-1 border-l border-border/50 bg-card/60 text-muted-foreground hover:bg-accent/40 hover:text-foreground tz-transition"
      >
        <PanelRightOpen className="h-4 w-4" />
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
    <aside className="flex h-full w-80 flex-col border-l border-border/50 bg-card/40 backdrop-blur-sm">
      {/* 顶部：会话切换 - 更精致 */}
      <div className="flex h-12 items-center justify-between border-b border-border/40 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent/60 hover:text-primary tz-transition disabled:opacity-40"
              disabled={loading}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="max-w-[150px] truncate">
                {currentConversation?.title ?? "和烛照对话"}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
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
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => newConversation(null)}
            title="新对话"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggle}
            title="折叠 (⌘B)"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 错误提示 - 更柔 */}
      {error && (
        <div className="border-b border-destructive/20 bg-destructive/[0.04] px-3 py-1.5 text-[10px] text-destructive/90">
          {error}
        </div>
      )}

      {/* 消息流 - 更舒展 */}
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="flex flex-col gap-4 px-3 py-4">
          {messages.length === 0 && !loading && (
            <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageSquare className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-[220px]">
                烛照在这里。记录任务、日记、灵感，或者直接说你卡住了什么。
              </p>
            </div>
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
            <div className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground/70">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              烛照正在思考...
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 输入区 - iMessage 风格 */}
      <div className="border-t border-border/40 p-3">
        <div className="relative">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="和烛照说点什么…"
            className="h-10 flex-1 rounded-xl border-border/50 bg-background/60 pr-10 text-sm placeholder:text-muted-foreground/60 transition-all duration-150 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            onKeyDown={(e) => {
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
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-150 hover:bg-primary/90 active:scale-95 disabled:pointer-events-none disabled:opacity-40 disabled:saturate-50"
            aria-label="发送"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground/60">
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </aside>
  );
}

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
  // Phase 6: scheduler 触发的追问消息以「[烛照追问]」开头，使用特殊样式
  const isSupervisorFollowUp =
    !isUser && !isSystem && message.content.startsWith("[烛照追问]");

  // 监督追问：去掉 [烛照追问] 前缀，让正文更干净
  const displayContent = isSupervisorFollowUp
    ? message.content.replace(/^\[烛照追问\]\s*/, "")
    : message.content;

  return (
    <div
      className={cn(
        "flex animate-slide-in flex-col gap-1",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words leading-relaxed",
          isUser
            ? "rounded-2xl rounded-br-md bg-primary/15 text-foreground"
            : isSystem
              ? "rounded-2xl border border-border/40 bg-muted/30 text-muted-foreground text-xs"
              : isSupervisorFollowUp
                ? "rounded-2xl rounded-bl-md border border-amber-500/30 bg-amber-500/[0.04] text-foreground"
                : "rounded-2xl rounded-bl-md bg-accent/50 text-foreground",
        )}
      >
        {isSupervisorFollowUp && (
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-amber-400">
            <span className="h-1 w-1 rounded-full bg-amber-400" />
            烛照追问
          </div>
        )}
        {displayContent}
      </div>
      <div className="flex items-center gap-1.5 px-1.5 text-[9px] text-muted-foreground/50">
        <span>{format(new Date(message.created_at), "HH:mm")}</span>
        {message.event_id && (
          <span title={`已关联到记录：${message.event_id}`}>· 已存档</span>
        )}
      </div>
    </div>
  );
}
