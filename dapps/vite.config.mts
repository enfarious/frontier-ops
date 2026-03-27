import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/frontier-ops/" : "/",
  plugins: [react()],
  server: {
    host: true, // bind to 0.0.0.0 so in-game browser can reach it
    proxy: {
      // Proxy LLM requests to avoid CORS issues with local LLMs
      "/llm-proxy": {
        target: "http://localhost:11434",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-proxy/, ""),
      },
    },
  },
});
