import { useEffect, useState } from "react";
import { Inbox, Zap } from "lucide-react";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { listRecent } from "@/lib/repositories/event-repo";
import { useAppStore } from "@/stores/app-store";
import type { EventRow } from "@/types/db";
import { format } from "date-fns";

const SOURCE_LABEL: Record<string, string> = {
  chat: "对话",
  quick_input: "快速输入",
  journal: "日记",
  reminder: "提醒",
  system: "系统",
};

const SOURCE_CLASS: Record<string, string> = {
  chat: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  quick_input: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  journal: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  reminder: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  system: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export function InboxPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setQuickInputOpen = useAppStore((s) => s.setQuickInputOpen);

  const reloadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listRecent(50);
      setEvents(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadData();
  }, []);

  return (
    <PagePlaceholder
      title="Inbox"
      description="待处理事件与最近输入"
      icon={Inbox}
      emptyHint="Inbox 是干净的。这是好状态。"
      action={
        <Button onClick={() => setQuickInputOpen(true)}>
          <Zap className="mr-1.5 h-4 w-4" />
          快速输入 (⌘+I)
        </Button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          加载失败：{error}
        </div>
      )}

      {loading ? (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          加载中...
        </div>
      ) : events.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground/50">
          <Inbox className="h-12 w-12" strokeWidth={1.5} />
          <p className="text-sm">Inbox 是干净的。这是好状态。</p>
        </div>
      ) : (
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-2 pr-2">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </ScrollArea>
      )}
    </PagePlaceholder>
  );
}

function EventCard({ event }: { event: EventRow }) {
  const sourceLabel = SOURCE_LABEL[event.source] ?? event.source;
  const sourceClass = SOURCE_CLASS[event.source] ?? SOURCE_CLASS.system;

  return (
    <Card className="p-3 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm break-words">{event.raw_content}</p>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 py-0 ${sourceClass}`}
            >
              {sourceLabel}
            </Badge>
            <span>{format(new Date(event.created_at), "MM-dd HH:mm")}</span>
            {event.ai_processed === 1 ? (
              <span className="text-emerald-400">· 已处理</span>
            ) : (
              <span className="text-muted-foreground/60">· 待 AI 处理</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
