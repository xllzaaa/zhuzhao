import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn/ui 标准工具函数：合并 Tailwind class
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
