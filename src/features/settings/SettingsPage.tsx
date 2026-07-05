/**
 * Settings 页 (Phase 9 收口 + UI 批次 3 中文化)
 *
 * 5 大区：
 * 1. AI 引擎配置区（Phase 4）
 * 2. Markdown 导出设置区（Phase 8 + Phase 9 安全加固）
 * 3. 数据与安全区（Phase 9 JSON 备份 + 数据库说明）
 * 4. 诊断与日志区（Phase 9）
 * 5. 关于烛照区（Phase 9）
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
      title="设置"
      description="AI 引擎、数据、安全和导出"
      icon={SettingsIcon}
      emptyHint="配置项"
    >
      {/* 1. AI 引擎配置区 */}
      <section className="rounded-2xl border border-border/50 bg-card/80 p-5 tz-transition">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Cpu className="h-4 w-4 text-primary" />
          <span>AI 引擎</span>
          <span className="text-[10px] text-muted-foreground/70">
            · API Key 仅本地存储，不导出
          </span>
        </header>
        <LlmProviderSection />
      </section>

      {/* 2. Markdown 导出设置区 */}
      <section className="mt-4 rounded-2xl border border-border/50 bg-card/80 p-5 tz-transition">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span>Markdown 导出</span>
          <span className="text-[10px] text-muted-foreground/70">
            · 路径安全已加固，支持 Obsidian
          </span>
        </header>
        <MarkdownSettingsSection />
      </section>

      {/* 3. 数据与安全 */}
      <section className="mt-4 rounded-2xl border border-border/50 bg-card/80 p-5 tz-transition">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Database className="h-4 w-4 text-primary" />
          <span>数据与安全</span>
        </header>
        <DataSafetySection />
      </section>

      {/* 4. 诊断与日志 */}
      <section className="mt-4 rounded-2xl border border-border/50 bg-card/80 p-5 tz-transition">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" />
          <span>诊断日志</span>
          <span className="text-[10px] text-muted-foreground/70">
            · 本地存储，已脱敏
          </span>
        </header>
        <DiagnosticsSection />
      </section>

      {/* 5. 关于烛照 */}
      <section className="mt-4 rounded-2xl border border-border/50 bg-card/80 p-5 tz-transition">
        <header className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-primary" />
          <span>关于烛照</span>
        </header>
        <AboutSection />
      </section>
    </PagePlaceholder>
  );
}
