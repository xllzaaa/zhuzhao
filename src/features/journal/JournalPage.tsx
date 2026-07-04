import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export function JournalPage() {
  return (
    <PagePlaceholder
      title="Journal"
      description="日记 · 原文全量保存"
      icon={BookOpen}
      emptyHint="今天还没写日记。哪怕一句也行。"
      action={
        <Button>
          <Plus className="mr-1.5 h-4 w-4" />
          写日记
        </Button>
      }
    />
  );
}
