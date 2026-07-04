import { ClipboardList, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export function ReviewsPage() {
  return (
    <PagePlaceholder
      title="Reviews"
      description="每日总结与复盘"
      icon={ClipboardList}
      emptyHint="还没有总结。今天结束时，生成一个。"
      action={
        <Button>
          <Zap className="mr-1.5 h-4 w-4" />
          生成今日总结
        </Button>
      }
    />
  );
}
