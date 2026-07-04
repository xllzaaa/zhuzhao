/**
 * 烛照应用类型定义
 * 详见 openspec/specs/zhuzhao-core/spec.md
 */

/** 应用页面 ID（对应左导航 7 个页面） */
export type PageId =
  | "dashboard"
  | "inbox"
  | "tasks"
  | "journal"
  | "ideas"
  | "reviews"
  | "settings";

/** 主题 */
export type Theme = "dark" | "light";

/** 导航项配置 */
export interface NavItem {
  id: PageId;
  label: string;
  /** Lucide 图标名（在组件中映射） */
  icon: string;
  /** 快捷键数字 1-7 */
  shortcut: number;
}
