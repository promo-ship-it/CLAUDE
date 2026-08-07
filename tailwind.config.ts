import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B2A2E",
        sand: "#F3EEE4",
        brick: "#A65A3D",
        sage: "#7C8B7A",
        paper: "#FBFAF7",
        line: "#DDD4C2"
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"]
      },
      borderRadius: {
        card: "6px"
      }
    }
  },
  plugins: []
};
export default config;
