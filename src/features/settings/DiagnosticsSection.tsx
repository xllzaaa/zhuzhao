/**
 * Settings · 诊断与日志区 (Phase 9)
 *
 * 功能：
 * - 查看最近 N 条日志（按时间倒序）
 * - 按级别过滤（info / warn / error / all）
 * - 清空日志（二次确认）
 * - 导出日志为 JSON
 *
 * 安全：
 * - 不显示 api_key / authorization
 * - 错误信息已在前端 log-repo 脱敏
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Trash2,
  Download,
  Loader2,
  RefreshCw,
  AlertCircle,
  Info,
  AlertTriangle,
  XOctagon,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listRecent,
  clearAllLogs,
  countLogs,
  type AppLogRow,
  type LogLevel,
} from "@/lib/repositories/log-repo";
import { exportLogsJson } from "@/lib/backup/backup-exporter";

type Filter = "all" | LogLevel;

const FILTERS: { value: Filter; label: string; icon: typeof Info }[] = [
  { value: "all", label: "全部", icon: Activity },
  { value: "error", label: "Error", icon: XOctagon },
  { value: "warn", label: "Warn", icon: AlertTriangle },
  { value: "info", label: "Info", icon: Info },
];

export function DiagnosticsSection() {
  const [logs, setLogs] = useState<AppLogRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [recent, total] = await Promise.all([listRecent(300), countLogs()]);
      setLogs(recent);
      setTotalCount(total);
    } catch (err) {
      toast.error("加载日志失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearing(true);
    try {
      const deleted = await clearAllLogs();
      toast.success(`已清空 ${deleted} 条日志`);
      setConfirmClear(false);
      await reload();
    } catch (err) {
      toast.error("清空失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setClearing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportLogsJson();
      // 成功 toast 在 exporter 内部
    } catch (err) {
      toast.error("导出失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExporting(false);
    }
  };

  const filtered = filter === "all" ? logs : logs.filter((l) => l.level === filter);

  const counts = {
    all: totalCount,
    error: logs.filter((l) => l.level === "error").length,
    warn: logs.filter((l) => l.level === "warn").length,
    info: logs.filter((l) => l.level === "info").length,
  };

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.value;
            const count = counts[f.value];
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                <Icon className="h-3 w-3" />
                {f.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded px-1 text-[10px]",
                      active ? "bg-primary-foreground/20" : "bg-muted-foreground/15",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={reload}
            disabled={loading}
            title="刷新"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || totalCount === 0}
          >
            {exporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            导出日志
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={clearing || totalCount === 0}
            className={cn(
              "text-destructive hover:text-destructive",
              confirmClear && "border-destructive bg-destructive/10",
            )}
          >
            {clearing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            {confirmClear ? "再次确认清空" : "清空日志"}
          </Button>
        </div>
      </div>

      {/* 日志列表 */}
      <div className="rounded border border-border bg-muted/20 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-xs text-muted-foreground">
            <Activity className="h-5 w-5 opacity-50" />
            暂无日志
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((log) => (
              <li key={log.id} className="px-3 py-2 hover:bg-muted/30">
                <div className="flex items-start gap-2">
                  <LevelBadge level={log.level} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono">
                        {format(new Date(log.created_at), "MM-dd HH:mm:ss")}
                      </span>
                      <span className="rounded bg-muted-foreground/10 px-1">
                        {log.scope}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs break-words whitespace-pre-wrap">
                      {log.message}
                    </p>
                    {log.meta_json && (
                      <pre className="mt-1 text-[10px] font-mono text-muted-foreground/80 bg-muted/40 rounded p-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-all">
                        {log.meta_json}
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/60">
        日志保存在本地 SQLite app_logs 表，不自动上传。已脱敏处理。
      </p>

      {confirmClear && (
        <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5" />
          确认清空全部日志？此操作不可恢复。再次点击"清空日志"以确认。
        </div>
      )}
    </div>
  );
}

function LevelBadge({ level }: { level: LogLevel }) {
  const config = {
    info: { icon: Info, color: "text-blue-400" },
    warn: { icon: AlertTriangle, color: "text-amber-400" },
    error: { icon: XOctagon, color: "text-rose-400" },
  } as const;
  const { icon: Icon, color } = config[level];
  return <Icon className={cn("h-3.5 w-3.5 mt-0.5 flex-shrink-0", color)} />;
}
