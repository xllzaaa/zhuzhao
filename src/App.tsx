import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { LeftNav } from "@/components/layout/LeftNav";
import { ChatSidebar } from "@/components/layout/ChatSidebar";
import { QuickInputDialog } from "@/components/layout/QuickInputDialog";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { InboxPage } from "@/features/inbox/InboxPage";
import { TasksPage } from "@/features/tasks/TasksPage";
import { JournalPage } from "@/features/journal/JournalPage";
import { IdeasPage } from "@/features/ideas/IdeasPage";
import { ReviewsPage } from "@/features/reviews/ReviewsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { useAppStore } from "@/stores/app-store";
import { useGlobalShortcuts } from "@/lib/hooks/use-global-shortcuts";
import { useSupervisionScheduler } from "@/lib/hooks/use-supervision-scheduler";
import { initDatabase } from "@/lib/db";
import { ensureSeedData } from "@/lib/seed";

export default function App() {
  const currentPage = useAppStore((s) => s.currentPage);
  const theme = useAppStore((s) => s.theme);
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // 全局快捷键
  useGlobalShortcuts();

  // Phase 6: 启动监督 scheduler（启动时 recovery + 60s 轮询 pending reminder）
  useSupervisionScheduler({ ready: dbReady });

  // 主题切换：操作 documentElement class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // 初始化 SQLite + Phase 2 种子数据（仅 dev 模式）
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        // Phase 2 验证用：若数据库为空则插入示例数据
        // Phase 9 会改为 Settings 内手动触发
        if (import.meta.env.DEV) {
          await ensureSeedData();
        }
        setDbReady(true);
      } catch (err: unknown) {
        console.error("[DB] 初始化失败：", err);
        const msg = err instanceof Error ? err.message : String(err);
        setDbError(msg);
      }
    })();
  }, []);

  // DB 加载中
  if (!dbReady && !dbError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">烛照启动中...</p>
        </div>
      </div>
    );
  }

  // DB 错误
  if (dbError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="max-w-md rounded-lg border border-destructive/30 bg-card p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-destructive">
            数据库初始化失败
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">{dbError}</p>
          <p className="text-xs text-muted-foreground/60">
            请检查 SQLite 插件配置。重启 App 后重试。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      {/* 全局极轻烛光 ambient（opacity 0.04-0.08） */}
      <AmbientBackground />

      {/* 左导航 */}
      <LeftNav />

      {/* 中间主内容区 */}
      <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "inbox" && <InboxPage />}
        {currentPage === "tasks" && <TasksPage />}
        {currentPage === "journal" && <JournalPage />}
        {currentPage === "ideas" && <IdeasPage />}
        {currentPage === "reviews" && <ReviewsPage />}
        {currentPage === "settings" && <SettingsPage />}
      </main>

      {/* 右侧 Chat Sidebar */}
      <ChatSidebar />

      {/* 全局快速输入 Dialog（⌘+I 唤起） */}
      <QuickInputDialog />

      {/* Toast 通知 */}
      <Toaster />
    </div>
  );
}
