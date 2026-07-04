import { useState } from "react";
import { PanelRightClose, PanelRightOpen, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

/** Chat 消息（Phase 1 占位，Phase 3 接入 DB） */
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

// Phase 1 占位消息
const PLACEHOLDER_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "system",
    content: "烛照在听。说点什么。",
    createdAt: new Date().toISOString(),
  },
];

export function ChatSidebar() {
  const open = useAppStore((s) => s.chatSidebarOpen);
  const toggle = useAppStore((s) => s.toggleChatSidebar);
  const [messages] = useState<ChatMessage[]>(PLACEHOLDER_MESSAGES);
  const [input, setInput] = useState("");

  // 折叠态：只显示一个圆形按钮
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

  return (
    <aside className="flex h-full w-80 flex-col border-l border-border bg-card">
      {/* 顶部 */}
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium">烛照 · 对话</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="新对话">
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

      {/* 消息流 */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
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
                // Phase 3 接入：保存为 Event + ConversationMessage
                setInput("");
              }
            }}
          />
          <Button size="icon" title="发送 (⌘+Enter)">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          ⌘+Enter 发送
        </p>
      </div>
    </aside>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
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
    </div>
  );
}
