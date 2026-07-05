/**
 * Settings 页 (Phase 9 收口)
 *
 * 4 大区：
 * 1. LLM Provider 配置区（Phase 4）
 * 2. Markdown / Obsidian 导出设置区（Phase 8 + Phase 9 安全加固）
 * 3. 数据与安全区（Phase 9 JSON 备份 + 数据库说明）
 * 4. 关于 / 版本区（Phase 9）
 *
 * 此外包含：
 * - 诊断与日志区（Phase 9）
 */

import {
  Settings as SettingsIcon,
  Cpu,
  FolderOpen,
  Database,
  Activity,
  Info,
} from "lucide-react";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { LlmProviderSection } from "./LlmProviderSection";
import { MarkdownSettingsSection } from "./MarkdownSettingsSection";
import { DataSafetySection } from "./DataSafetySection";
import { DiagnosticsSection } from "./DiagnosticsSection";
import { AboutSection } from "./AboutSection";

export function SettingsPage() {
  return (
    <PagePlaceholder
      title="Settings"
      description="配置 · LLM · 导出 · 数据安全 · 诊断"
      icon={SettingsIcon}
      emptyHint="配置项"
    >
      {/* 1. LLM Provider 配置区 */}
      <section className="rounded-lg border border-border bg-card p-4">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Cpu className="h-4 w-4" />
          <span>LLM Provider</span>
          <span className="text-[10px] text-muted-foreground/70">
            · API Key 仅本地存储，不导出
          </span>
        </header>
        <LlmProviderSection />
      </section>

      {/* 2. Markdown / Obsidian 导出设置区 */}
      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="h-4 w-4" />
          <span>Markdown / Obsidian 导出</span>
          <span className="text-[10px] text-muted-foreground/70">
            · Phase 9 路径安全加固
          </span>
        </header>
        <MarkdownSettingsSection />
      </section>

      {/* 3. 数据与安全 */}
      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Database className="h-4 w-4" />
          <span>数据与安全</span>
        </header>
        <DataSafetySection />
      </section>

      {/* 4. 诊断与日志 */}
      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4" />
          <span>诊断与日志</span>
          <span className="text-[10px] text-muted-foreground/70">
            · 本地存储，已脱敏
          </span>
        </header>
        <DiagnosticsSection />
      </section>

      {/* 5. 关于 */}
      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4" />
          <span>关于</span>
        </header>
        <AboutSection />
      </section>
    </PagePlaceholder>
  );
}
