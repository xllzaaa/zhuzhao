import { LayoutDashboard, Zap, FileText, Lightbulb, AlertTriangle, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PagePlaceholder, PlaceholderCard } from "@/components/layout/PagePlaceholder";

export function DashboardPage() {
  return (
    <PagePlaceholder
      title="Dashboard"
      description="每日作战室 · 照见今日状态"
      icon={LayoutDashboard}
      emptyHint="这里空着，是因为你还没有输入今天的第一件事。"
    >
      {/* 快速输入框（吸顶） */}
      <div className="mb-6 sticky top-0 z-10 -mx-6 -mt-6 bg-background/80 px-6 py-4 backdrop-blur border-b border-border">
        <div className="flex gap-2">
          <Input
            placeholder="⚡ 快速输入... (⌘+I 全局唤起)"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                // Phase 3 接入：保存为 Event
                e.currentTarget.value = "";
              }
            }}
          />
          <Button>
            <Zap className="mr-1.5 h-4 w-4" />
            提交
          </Button>
        </div>
      </div>

      {/* 三列网格 - Dashboard 主体（Phase 2 起接入真实数据） */}
      <div className="grid gap-4 md:grid-cols-3">
        <PlaceholderCard
          title="今日最重要"
          className="md:col-span-1"
        >
          <div className="flex h-28 items-center justify-center text-xs text-muted-foreground/50">
            还没有任务
          </div>
        </PlaceholderCard>

        <PlaceholderCard title="今日到期">
          <div className="flex h-28 items-center justify-center text-xs text-muted-foreground/50">
            0 项
          </div>
        </PlaceholderCard>

        <PlaceholderCard
          title="烛照监督提醒"
          className="border-destructive/30"
        >
          <div className="flex h-28 flex-col items-center justify-center gap-2 text-xs text-muted-foreground/50">
            <AlertTriangle className="h-5 w-5 text-destructive/40" />
            <span>暂无逾期</span>
          </div>
        </PlaceholderCard>

        <PlaceholderCard title="进行中">
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground/50">
            0 项
          </div>
        </PlaceholderCard>

        <PlaceholderCard title="延期任务" className="border-destructive/20">
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground/50">
            0 项
          </div>
        </PlaceholderCard>

        <PlaceholderCard title="今日输入">
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground/50">
            0 条
          </div>
        </PlaceholderCard>

        <PlaceholderCard title="最近日记">
          <FileText className="mx-auto h-5 w-5 text-muted-foreground/30" />
        </PlaceholderCard>

        <PlaceholderCard title="最近灵感">
          <Lightbulb className="mx-auto h-5 w-5 text-muted-foreground/30" />
        </PlaceholderCard>

        <PlaceholderCard title="每日总结">
          <ClipboardList className="mx-auto h-5 w-5 text-muted-foreground/30" />
        </PlaceholderCard>
      </div>
    </PagePlaceholder>
  );
}
