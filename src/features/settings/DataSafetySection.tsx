/**
 * Settings · 数据与安全区 (Phase 9)
 *
 * 功能：
 * - 显示数据库位置说明
 * - 导出 JSON 备份（排除 api_key）
 * - 清空日志入口（在 DiagnosticsSection 内已实现）
 *
 * 安全：
 * - 不显示 api_key
 * - 危险操作（清空日志）二次确认
 */

import { useState } from "react";
import {
  Database,
  Download,
  Loader2,
  ShieldCheck,
  FileJson,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportJsonBackup } from "@/lib/backup/backup-exporter";

export function DataSafetySection() {
  const [exporting, setExporting] = useState(false);

  const handleBackup = async () => {
    setExporting(true);
    try {
      await exportJsonBackup();
      // 成功 toast 在 exporter 内部
    } catch (err) {
      toast.error("备份失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 数据库位置说明 */}
      <div className="rounded border border-border bg-muted/20 p-3">
        <div className="flex items-start gap-2">
          <Database className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium">SQLite 数据库</div>
            <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              <div>文件名：<code className="font-mono">zhuzhao.db</code></div>
              <div>位置：用户数据目录（Tauri AppData）</div>
              <div>角色：唯一主数据源，Markdown / JSON 仅为导出视图</div>
            </div>
          </div>
        </div>
      </div>

      {/* 安全说明 */}
      <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-400" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-emerald-300">数据安全</div>
            <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              <li>· API Key 仅存储在本地 SQLite，不上传，不导出</li>
              <li>· JSON 备份中 llm_providers.api_key 被脱敏为 null</li>
              <li>· 不写入 Authorization / Bearer / token / secret</li>
              <li>· 日志写入前已脱敏</li>
              <li>· Markdown 导出经过路径安全校验，防止穿越</li>
            </ul>
          </div>
        </div>
      </div>

      {/* JSON 备份 */}
      <div className="rounded border border-border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <FileJson className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">JSON 备份</div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                把全部业务数据（events / tasks / journal / ideas / reviews / ...）导出为单个 JSON 文件，写入导出目录下的 Zhuzhao/Backups/。
                llm_providers.api_key 会被脱敏为 null。
              </p>
            </div>
          </div>
          <Button
            onClick={handleBackup}
            disabled={exporting}
            size="sm"
          >
            {exporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            {exporting ? "备份中..." : "导出 JSON 备份"}
          </Button>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60">
        V0 仅支持导出备份，不支持导入恢复。备份文件由用户自行保管。
      </p>
    </div>
  );
}
