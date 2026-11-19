import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Браузер ходит на /api/until того же адреса, что и страница.
    // Локально nginx нет, поэтому Vite пересылает /api на Python.
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
