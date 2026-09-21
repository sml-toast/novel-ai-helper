import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: [
          '"Noto Serif SC"',
          '"Songti SC"',
          '"Source Han Serif SC"',
          "Georgia",
          "serif",
        ],
        display: ['"Playfair Display"', '"Noto Serif SC"', "Georgia", "serif"],
      },
      colors: {
        paper: { DEFAULT: "#f3e9d8", deep: "#e7d8bf" },
        ink: { DEFAULT: "#2b2420", soft: "#5b5048" },
        ochre: { DEFAULT: "#c4762f", soft: "#e0a45c" },
      },
      boxShadow: {
        paper: "0 24px 70px -28px rgba(60,40,20,0.45)",
      },
      keyframes: {
        breath: {
          "0%,100%": { opacity: "0.3", transform: "translateY(0)" },
          "50%": { opacity: "1", transform: "translateY(-3px)" },
        },
      },
      animation: {
        breath: "breath 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
