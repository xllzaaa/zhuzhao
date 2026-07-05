/**
 * Settings · 关于区 (Phase 9)
 *
 * 显示 App 名称、版本、阶段、本地优先说明。
 */

import { ShieldCheck, Heart, HardDrive } from "lucide-react";

const APP_VERSION = "v0.1.0";
const APP_PHASE = "V0";

export function AboutSection() {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-base font-semibold">烛照</div>
        <div className="text-xs text-muted-foreground">
          本地优先的强监督型个人 AI 助手
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <div className="text-[10px] text-muted-foreground/70">版本</div>
          <div className="font-mono">{APP_VERSION}</div>
        </div>
        <div className="rounded border border-border bg-muted/20 px-2 py-1.5">
          <div className="text-[10px] text-muted-foreground/70">阶段</div>
          <div className="font-mono">{APP_PHASE}（阶段 0-9 已完成）</div>
        </div>
      </div>

      <div className="space-y-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-start gap-1.5">
          <HardDrive className="h-3.5 w-3.5 mt-0.5 text-emerald-400 flex-shrink-0" />
          <span>本地优先：所有数据存储在本机 SQLite，不上传服务器</span>
        </div>
        <div className="flex items-start gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-emerald-400 flex-shrink-0" />
          <span>不联网遥测、不自动上传日志、不自动同步、不自动 git</span>
        </div>
        <div className="flex items-start gap-1.5">
          <Heart className="h-3.5 w-3.5 mt-0.5 text-emerald-400 flex-shrink-0" />
          <span>用户对数据拥有完全控制权</span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60 italic">
        烛照者，照见真实状态、拖延、借口与行动。
      </p>
    </div>
  );
}
