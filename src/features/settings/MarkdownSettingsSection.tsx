/**
 * Settings · Markdown / Obsidian 配置区 (Phase 8)
 *
 * 功能：
 * - 启用 / 禁用 Markdown 导出
 * - 选择或手动填写导出目录
 * - 自动导出开关
 * - 手动导出全部按钮
 * - 打开导出目录按钮
 * - 显示最近导出状态
 *
 * 安全：
 * - 不显示 / 不编辑 API Key
 * - 不显示 / 不编辑 LLM Provider 配置
 * - 路径保存在 SQLite app_settings 表
 */

import { useEffect, useState, useCallback } from "react";
import {
  FolderOpen,
  FolderTree,
  Download,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Power,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getMarkdownSettings,
  saveMarkdownSettings,
  pickExportDirectory,
  openExportDirectory,
  exportAllWithFeedback,
} from "@/lib/markdown/exporter";
import type { MarkdownSettings } from "@/lib/markdown/exporter";
import { format } from "date-fns";

export function MarkdownSettingsSection() {
  const [settings, setSettings] = useState<MarkdownSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dirInput, setDirInput] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getMarkdownSettings();
      setSettings(s);
      setDirInput(s.exportDir);
    } catch (err) {
      toast.error("加载 Markdown 设置失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handlePickDir = async () => {
    const dir = await pickExportDirectory();
    if (dir) {
      setDirInput(dir);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await saveMarkdownSettings({ exportDir: dirInput.trim() });
      setSettings(updated);
      toast.success("导出目录已保存");
    } catch (err) {
      toast.error("保存设置失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await saveMarkdownSettings({ enabled: !settings.enabled });
      setSettings(updated);
      toast.success(updated.enabled ? "Markdown 导出已启用" : "Markdown 导出已禁用");
    } catch (err) {
      toast.error("切换失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAuto = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await saveMarkdownSettings({ autoExport: !settings.autoExport });
      setSettings(updated);
    } catch (err) {
      toast.error("切换自动导出失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!settings?.enabled) {
      toast.error("请先启用 Markdown 导出");
      return;
    }
    if (!settings.exportDir) {
      toast.error("请先设置导出目录");
      return;
    }
    setExporting(true);
    try {
      const result = await exportAllWithFeedback(undefined, { showToast: true });
      // 刷新设置以显示最近导出状态
      await reload();
      if (result.success && result.files.some((f) => f.mode === "bypass")) {
        const bypassed = result.files.filter((f) => f.mode === "bypass");
        toast.warning(`检测到 ${bypassed.length} 个用户文件未被覆盖`, {
          description: "已写入 .zhuzhao.md 旁路文件",
        });
      }
    } catch (err) {
      toast.error("导出失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExporting(false);
    }
  };

  const handleOpenDir = async () => {
    await openExportDirectory();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  const enabled = settings?.enabled ?? false;
  const autoExport = settings?.autoExport ?? false;
  const lastExportAt = settings?.lastExportAt ?? null;
  const lastExportStatus = settings?.lastExportStatus ?? null;
  const lastExportMessage = settings?.lastExportMessage ?? null;

  return (
    <div className="space-y-4">
      {/* 启用开关 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Power className={cn("h-4 w-4", enabled ? "text-emerald-400" : "text-muted-foreground")} />
          <span className="text-sm font-medium">Markdown 导出</span>
          <span
            className={cn(
              "rounded px-1.5 py-0 text-[10px]",
              enabled
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {enabled ? "已启用" : "未启用"}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleEnabled}
          disabled={saving}
        >
          {enabled ? "禁用" : "启用"}
        </Button>
      </div>

      {/* 导出目录 */}
      <div>
        <label className="mb-1.5 block text-xs text-muted-foreground">
          导出目录（Obsidian Vault 或本地任意目录）
        </label>
        <div className="flex gap-2">
          <Input
            value={dirInput}
            onChange={(e) => setDirInput(e.target.value)}
            placeholder="例如：D:\Obsidian\我的库 或 /Users/you/vault"
            className="flex-1 font-mono text-xs"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handlePickDir}
            title="选择目录"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving || dirInput === (settings?.exportDir ?? "")}
            title="保存目录"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          SQLite 仍是主数据源。导出目录由用户选择，烛照不会写入项目源码目录或系统敏感目录。
        </p>
      </div>

      {/* 自动导出 */}
      <div className="flex items-center justify-between rounded border border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <RefreshCw className={cn("h-3.5 w-3.5", autoExport ? "text-emerald-400" : "text-muted-foreground")} />
          <span className="text-xs">生成每日总结后自动导出 Daily Markdown</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleAuto}
          disabled={saving || !enabled}
          className="h-7"
        >
          {autoExport ? "已开启" : "已关闭"}
        </Button>
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleExport}
          disabled={!enabled || !settings?.exportDir || exporting}
          size="sm"
        >
          {exporting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          {exporting ? "导出中..." : "立即导出全部"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenDir}
          disabled={!settings?.exportDir}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          打开导出目录
        </Button>
      </div>

      {/* 最近导出状态 */}
      {lastExportAt && (
        <div
          className={cn(
            "rounded border px-3 py-2 text-xs",
            lastExportStatus === "success"
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/5 text-rose-300",
          )}
        >
          <div className="flex items-center gap-1.5">
            {lastExportStatus === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">
              最近导出：{lastExportStatus === "success" ? "成功" : "失败"}
            </span>
            <span className="text-muted-foreground/70">
              · {format(new Date(lastExportAt), "yyyy-MM-dd HH:mm")}
            </span>
          </div>
          {lastExportMessage && (
            <p className="mt-1 pl-5 text-[10px] text-muted-foreground/80">
              {lastExportMessage}
            </p>
          )}
        </div>
      )}

      {/* 目录结构预览 */}
      {enabled && settings?.exportDir && (
        <div className="rounded border border-border bg-muted/20 p-3 font-mono text-[10px] text-muted-foreground">
          <div className="mb-1 flex items-center gap-1">
            <FolderTree className="h-3 w-3" />
            <span className="font-sans text-xs">导出目录结构</span>
          </div>
          <pre className="overflow-x-auto">{settings.exportDir}/
  └── Zhuzhao/
      ├── Daily/
      │   └── YYYY-MM-DD.md
      ├── Journal/
      │   └── YYYY-MM-DD.md
      ├── Tasks/
      │   └── tasks.md
      ├── Ideas/
      │   └── ideas.md
      └── Index.md</pre>
        </div>
      )}
    </div>
  );
}
