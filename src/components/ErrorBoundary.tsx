/**
 * 全局 ErrorBoundary (Phase 9)
 *
 * - 捕获 React 渲染层异常，避免 App 整体白屏
 * - 显示友好错误卡片
 * - 提供"重新加载"按钮
 * - 不暴露原始技术错误，仅显示简短摘要
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      // 仅截取前 200 字符，避免泄露过多技术细节
      errorMessage: error.message?.slice(0, 200) ?? "未知错误",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 仅打印到控制台，不上报
    console.error("[ErrorBoundary] 捕获到渲染错误：", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: "" });
    // 重新加载当前页面
    if (typeof window !== "undefined" && window.location) {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-md w-full rounded-lg border border-destructive/30 bg-card p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-destructive">
                烛照遇到了问题
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                页面渲染时发生错误。可以尝试重新加载。
              </p>
            </div>
          </div>
          <div className="rounded bg-muted/40 p-3 text-xs font-mono text-muted-foreground mb-4 max-h-32 overflow-y-auto">
            {this.state.errorMessage || "未知错误"}
          </div>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            重新加载
          </button>
        </div>
      </div>
    );
  }
}
