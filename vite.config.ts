import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @tauri-apps/cli 会自动注入 dev server 配置
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Tauri 2 期待前端在固定端口
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 不监听 Rust 端改动（避免触发 vite 热更新）
      ignored: ["**/src-tauri/**"],
    },
  },
}));
