import type { Config } from "tailwindcss";

/**
 * Tema "terminal Bloomberg" (sistema de diseño Boveda).
 *
 * Extiende de forma aditiva los tokens previos de la v2 (surface/slate/brand)
 * y suma la paleta de la app anterior: amber como acento, escala monocromática
 * de grises (navy/ink) y rojo/verde duros para P&L. Radios en 0 (cajas planas).
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Acento principal: amber Bloomberg.
        brand: {
          DEFAULT: "#ff8a00",
          50: "#fff7e6",
          100: "#ffecc7",
          200: "#ffd98a",
          300: "#ffc14d",
          400: "#ffa620",
          500: "#ff8a00",
          600: "#e07300",
          700: "#b35a00",
          800: "#864200",
          900: "#5a2c00",
          950: "#3a1d00",
        },
        // Superficies oscuras: se conserva la escala numérica de la v2
        // (las páginas existentes usan surface-900/950) y se mantiene cercana
        // al negro absoluto del look terminal.
        surface: {
          DEFAULT: "#0f172a",
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          700: "#0e0e0e",
          800: "#0a0a0a",
          900: "#050505",
          950: "#000000",
        },
        // Grises monocromáticos (negro → carbón) para el chrome de la app.
        navy: {
          950: "#000000",
          900: "#050505",
          850: "#0a0a0a",
          800: "#0e0e0e",
          750: "#121212",
          700: "#161616",
          650: "#1c1c1c",
          600: "#222222",
          500: "#2c2c2c",
          400: "#3a3a3a",
          300: "#4a4a4a",
        },
        ink: { 950: "#000000", 900: "#050505", 800: "#0a0a0a", 700: "#121212" },
        income: { DEFAULT: "#00d26a", light: "#39e088", dark: "#00a050" },
        expense: { DEFAULT: "#ff3b3b", light: "#ff6b6b", dark: "#cc2a2a" },
        warning: { DEFAULT: "#ffd700", light: "#ffe34d", dark: "#d9b600" },
        accent: { 300: "#ffc14d", 400: "#ffa620", 500: "#ff8a00", 600: "#e07300" },
        slate: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        },
      },
      fontFamily: {
        mono: ["var(--font-plex-mono)", "var(--font-geist-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-plex-mono)", "var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        none: "0",
        sm: "0",
        DEFAULT: "0",
        md: "0",
        lg: "2px",
        xl: "2px",
        "2xl": "2px",
        "3xl": "2px",
        full: "9999px",
      },
      animation: {
        "fade-in": "fadeIn 0.15s linear",
        "slide-up": "slideUp 0.2s linear",
        "slide-right": "slideRight 0.15s linear",
        shimmer: "shimmer 1.2s linear infinite",
        blink: "blink 1s steps(2) infinite",
        "page-in": "pageIn 0.18s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideRight: {
          "0%": { opacity: "0", transform: "translateX(-6px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        blink: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0" } },
        pageIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
