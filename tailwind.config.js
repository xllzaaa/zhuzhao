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
        // 烛照业务状态色（直接值，见 UI_UX_SPEC §8 / §10）
        status: {
          inbox: "#a1a1aa", // zinc-400
          planned: "#0ea5e9", // sky-500
          doing: "#f59e0b", // amber-500（烛光）
          done: "#10b981", // emerald-500
          delayed: "#f97316", // orange-500
          harsh: "#e11d48", // rose-600
          blocked: "#8b5cf6", // violet-500
          dropped: "#52525b", // zinc-600
          review: "#facc15", // yellow-400
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "PingFang SC",
          "Microsoft YaHei",
          "Source Han Sans SC",
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
      },
      animation: {
        "pulse-harsh": "pulse-harsh 1.5s ease-in-out 2",
        "fade-in": "fade-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};
