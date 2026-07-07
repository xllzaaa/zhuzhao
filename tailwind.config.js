/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // shadcn/ui token 结构（HSL 变量）
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // 烛照业务状态色（保留语义，UI 中只用在小胶囊）
        status: {
          inbox: "#a1a1aa",      // zinc-400
          planned: "#7dd3fc",    // sky-300
          doing: "#f0b04e",      // 柔烛光
          done: "#34d399",       // emerald-400
          delayed: "#fb923c",    // orange-400
          harsh: "#e879a6",      // rose-400
          blocked: "#a78bfa",    // violet-400
          dropped: "#71717a",    // zinc-500
          review: "#facc15",     // yellow-400
        },
        // Premium 风险色（低饱和，用于左侧细条 + 小胶囊，opacity 由组件控制）
        risk: {
          overdue: "hsl(var(--risk-overdue))",
          delay: "hsl(var(--risk-delay))",
          harsh: "hsl(var(--risk-harsh))",
        },
        // 元信息层级（比 muted-foreground 更淡）
        meta: {
          foreground: "hsl(var(--meta-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
        "3xl": "calc(var(--radius) + 12px)",
      },
      fontFamily: {
        sans: [
          "SF Pro Display",
          "SF Pro Text",
          "MiSans",
          "HarmonyOS Sans SC",
          "PingFang SC",
          "Alibaba PuHuiTi 3.0",
          "Microsoft YaHei UI",
          "Segoe UI Variable",
          "Segoe UI",
          "Noto Sans SC",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },
      keyframes: {
        "pulse-harsh": {
          "0%, 100%": { boxShadow: "0 0 0 0 hsl(var(--destructive) / 0.4)" },
          "50%": { boxShadow: "0 0 0 4px hsl(var(--destructive) / 0)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "page-enter": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-harsh": "pulse-harsh 1.5s ease-in-out 2",
        "fade-in": "fade-in 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in": "slide-in 180ms cubic-bezier(0.16, 1, 0.3, 1)",
        "page-enter": "page-enter 220ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
      // Apple-like 缓动
      transitionTimingFunction: {
        "apple-out": "cubic-bezier(0.16, 1, 0.3, 1)",
        "apple-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};
