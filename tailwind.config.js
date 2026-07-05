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
        // 烛照业务状态色（柔和版，降一档饱和度）
        status: {
          inbox: "#a1a1aa",      // zinc-400
          planned: "#7dd3fc",    // sky-300（更柔）
          doing: "#f0b04e",      // 柔烛光（从 amber-500 调柔）
          done: "#34d399",       // emerald-400
          delayed: "#fb923c",    // orange-400
          harsh: "#e879a6",      // rose-400（更柔）
          blocked: "#a78bfa",    // violet-400
          dropped: "#71717a",    // zinc-500
          review: "#facc15",     // yellow-400
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      fontFamily: {
        sans: [
          "SF Pro Display",
          "SF Pro Text",
          "PingFang SC",
          "MiSans",
          "Segoe UI Variable",
          "Segoe UI",
          "Microsoft YaHei UI",
          "Noto Sans SC",
          "Inter",
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
      },
      animation: {
        "pulse-harsh": "pulse-harsh 1.5s ease-in-out 2",
        "fade-in": "fade-in 200ms ease-out",
        "slide-in": "slide-in 150ms ease-out",
      },
    },
  },
  plugins: [],
};
