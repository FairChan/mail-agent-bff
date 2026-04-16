import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import compression from "vite-plugin-compression";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    compression({ algorithm: "brotliCompress", ext: ".br" }),
    compression({ algorithm: "gzip", ext: ".gz" }),
  ],
  resolve: {
    alias: {
      "@mail-agent/shared-types": path.resolve(__dirname, "../../packages/shared-types/src/index.ts"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    headers: {
      "X-Frame-Options": "SAMEORIGIN",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/live": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/ready": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          tailwind: ["tailwindcss"],
          inbox: ["./src/components/dashboard/InboxView"],
          stats: ["./src/components/dashboard/StatsView"],
          calendar: ["./src/components/dashboard/CalendarView"],
          settings: ["./src/components/dashboard/SettingsView"],
        },
      },
    },
  },
});
