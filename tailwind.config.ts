import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        panel: "#f7f8fa",
        line: "#d7dde5",
      },
      boxShadow: {
        soft: "0 12px 40px rgba(20, 28, 38, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
