import { Lightbulb, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export function IdeasPage() {
  return (
    <PagePlaceholder
      title="灵感"
      description="把突然冒出来的想法先收住"
      icon={Lightbulb}
      emptyHint="灵感还没出现，它来的时候记下来就行。"
      action={
        <Button>
          <Plus className="mr-1.5 h-4 w-4" />
          记录灵感
        </Button>
      }
    />
  );
}
