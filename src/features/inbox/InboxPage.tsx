import { Inbox } from "lucide-react";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export function InboxPage() {
  return (
    <PagePlaceholder
      title="Inbox"
      description="待处理事件与任务"
      icon={Inbox}
      emptyHint="Inbox 是干净的。这是好状态。"
    />
  );
}
