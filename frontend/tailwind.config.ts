import type { Config } from "tailwindcss";

/**
 * Sistema de diseño "Bóveda" — dark premium, acento mint sobre fondo casi-negro.
 *
 * Los tokens Tailwind se remapean a la paleta Bóveda para que el markup previo
 * (text-slate-*, bg-brand-*, text-emerald-*, text-red-*) adopte automáticamente
 * la nueva dirección visual:
 *   - brand  → mint (#5EE9B5)  · CTAs, positivos
 *   - emerald → mint            · positivos
 *   - red/rose → rust/bad       · negativos
 *   - amber/yellow → gold       · advertencias
 *   - slate  → escala texto↔fondo Bóveda (claro=texto, oscuro=superficie)
 *   - surface/navy/ink → escala de fondos Bóveda
 */
const mint = {
  DEFAULT: "#5ee9b5",
  50: "#eafdf5",
  100: "#c9f7e6",
  200: "#9ff0d2",
  300: "#76ecc3",
  400: "#5ee9b5",
  500: "#5ee9b5",
  600: "#3dcc9a",
  700: "#2ba37b",
  800: "#1f7a5d",
  900: "#155440",
  950: "#0c3327",
};

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Acento principal: mint.
        brand: mint,
        accent: { 300: "#76ecc3", 400: "#5ee9b5", 500: "#5ee9b5", 600: "#3dcc9a" },
        mint,
        // Escala de superficies oscuras Bóveda.
        surface: {
          DEFAULT: "#111114",
          50: "#f5f2eb",
          100: "#c9c5bc",
          200: "#807a6e",
          700: "#17171c",
          800: "#111114",
          900: "#0a0a0b",
          950: "#0a0a0b",
        },
        navy: {
          950: "#0a0a0b",
          900: "#0a0a0b",
          850: "#0e0e12",
          800: "#111114",
          750: "#14141a",
          700: "#17171c",
          650: "#1a1a20",
          600: "#1e1e25",
          500: "#26262f",
          400: "#33333d",
          300: "#4f4a42",
        },
        ink: { 950: "#0a0a0b", 900: "#0a0a0b", 800: "#111114", 700: "#17171c" },
        // Semánticos Bóveda.
        income: { DEFAULT: "#5ee9b5", light: "#76ecc3", dark: "#3dcc9a" },
        expense: { DEFAULT: "#e87a5b", light: "#ff6b5b", dark: "#cc5a3e" },
        warning: { DEFAULT: "#e6b85c", light: "#f0cd80", dark: "#cc9f3e" },
        gold: { DEFAULT: "#e6b85c", light: "#f0cd80", dark: "#cc9f3e" },
        rust: { DEFAULT: "#e87a5b", light: "#ff6b5b" },
        bad: { DEFAULT: "#ff6b5b" },
        violet: { DEFAULT: "#b49cff", light: "#c9b8ff" },
        // 'slate' remapeado: claros = texto, oscuros = superficie.
        slate: {
          50: "#f5f2eb",
          100: "#f5f2eb",
          200: "#c9c5bc",
          300: "#c9c5bc",
          400: "#807a6e",
          500: "#807a6e",
          600: "#4f4a42",
          700: "#2a2a30",
          800: "#1e1e25",
          900: "#111114",
          950: "#0a0a0b",
        },
        // 'emerald'/'red' remapeados a mint/rust para P&L del código previo.
        emerald: {
          200: "#9ff0d2",
          300: "#76ecc3",
          400: "#5ee9b5",
          500: "#5ee9b5",
          600: "#3dcc9a",
        },
        red: {
          200: "#ffb3a6",
          300: "#ff8f7d",
          400: "#ff6b5b",
          500: "#e87a5b",
          600: "#cc5a3e",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        serif: ["var(--font-instrument-serif)", "serif"],
      },
      borderRadius: {
        none: "0",
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "10px",
        "2xl": "14px",
        "3xl": "18px",
        full: "9999px",
      },
      boxShadow: {
        card: "0 4px 12px rgba(0,0,0,0.2)",
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
