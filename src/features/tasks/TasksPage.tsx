import { CheckSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export function TasksPage() {
  return (
    <PagePlaceholder
      title="Tasks"
      description="全部任务 · 按状态筛选"
      icon={CheckSquare}
      emptyHint="还没有任务。说一句话，烛照会帮你拆。"
      action={
        <Button>
          <Plus className="mr-1.5 h-4 w-4" />
          新建任务 (⌘N)
        </Button>
      }
    >
      <Tabs defaultValue="today" className="mb-4">
        <TabsList>
          <TabsTrigger value="today">今日</TabsTrigger>
          <TabsTrigger value="doing">进行中</TabsTrigger>
          <TabsTrigger value="delayed">延期</TabsTrigger>
          <TabsTrigger value="done">已完成</TabsTrigger>
          <TabsTrigger value="all">全部</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground/50">
        暂无任务（Phase 2 起接入真实数据）
      </div>
    </PagePlaceholder>
  );
}
