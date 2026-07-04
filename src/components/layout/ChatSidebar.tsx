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
  const scrollRef = useRef<HTMLDivElement>(null);

  // 挂载时加载会话
  useEffect(() => {
    init();
  }, [init]);

  // 消息更新或 intakePending 变化时自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, intakePending]);

  // 折叠态
  if (!open) {
    return (
      <button
        onClick={toggle}
        title="展开对话 (⌘B)"
        className="flex h-full w-10 items-center justify-center border-l border-border bg-card text-muted-foreground hover:text-foreground"
      >
        <PanelRightOpen className="h-5 w-5" />
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
    <aside className="flex h-full w-80 flex-col border-l border-border bg-card">
      {/* 顶部：会话切换 */}
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 text-sm font-medium hover:text-primary"
              disabled={loading}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="max-w-[160px] truncate">
                {currentConversation?.title ?? "新对话"}
              </span>
              <ChevronDown className="h-3 w-3" />
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
                  c.id === currentConversation?.id && "bg-accent",
                )}
              >
                <div className="flex flex-col">
                  <span className="truncate text-xs">
                    {c.title ?? "新对话"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(c.updated_at), "MM-dd HH:mm")}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-1">
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

      {/* 错误提示 */}
      {error && (
        <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[10px] text-destructive">
          {error}
        </div>
      )}

      {/* 消息流 */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex flex-col gap-3 px-3 py-3">
          {messages.length === 0 && !loading && (
            <div className="mt-8 flex flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground/60">
              <MessageSquare className="h-6 w-6" />
              <p>烛照在听。说点什么。</p>
            </div>
          )}
          {loading && messages.length === 0 && (
            <div className="mt-8 flex justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {intakePending && (
            <div className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground/70">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              烛照在思考...
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 输入区 */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入消息..."
            className="flex-1"
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
          <Button size="icon" onClick={handleSend} title="发送 (Enter)">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
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

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary/15 text-foreground"
            : isSystem
              ? "border border-border bg-muted/30 text-muted-foreground"
              : "bg-secondary text-secondary-foreground",
        )}
      >
        {message.content}
      </div>
      <div className="flex items-center gap-1.5 px-1 text-[9px] text-muted-foreground/60">
        <span>{format(new Date(message.created_at), "HH:mm")}</span>
        {message.event_id && (
          <span title={`event_id: ${message.event_id}`}>· 已存档</span>
        )}
      </div>
    </div>
  );
}
