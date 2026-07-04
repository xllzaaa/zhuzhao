import { Settings, Database, FolderOpen, Shield, Cpu } from "lucide-react";
import { PagePlaceholder, PlaceholderCard } from "@/components/layout/PagePlaceholder";
import { LlmProviderSection } from "./LlmProviderSection";

export function SettingsPage() {
  return (
    <PagePlaceholder
      title="Settings"
      description="配置 · LLM Provider · 同步 · 安全"
      icon={Settings}
      emptyHint="配置项"
    >
      {/* LLM Provider 配置区（Phase 4） */}
      <div className="rounded-lg border border-border bg-card p-4">
        <LlmProviderSection />
      </div>

      {/* 其他 Phase 占位 */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PlaceholderCard title="Markdown / Obsidian 同步（Phase 8）">
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <FolderOpen className="h-4 w-4" />
            未启用
          </div>
        </PlaceholderCard>

        <PlaceholderCard title="监督强度（Phase 9）">
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Shield className="h-4 w-4" />
            标准
          </div>
        </PlaceholderCard>

        <PlaceholderCard title="数据库">
          <div className="flex flex-col gap-1 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>SQLite: zhuzhao.db</span>
            </div>
            <span className="text-[10px] text-muted-foreground/60">
              位置：用户数据目录
            </span>
          </div>
        </PlaceholderCard>

        <PlaceholderCard title="LLM Intake（Phase 5）">
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Cpu className="h-4 w-4" />
            未启用
          </div>
        </PlaceholderCard>
      </div>

      {/* 关于 */}
      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-medium">关于烛照</h3>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>版本：v0.1.0 (Phase 4)</div>
          <div>定位：本地优先的强监督型个人 AI 助手</div>
          <div className="text-[10px] text-muted-foreground/60">
            烛照者，照见真实状态、拖延、借口与行动。
          </div>
        </div>
      </div>
    </PagePlaceholder>
  );
}
