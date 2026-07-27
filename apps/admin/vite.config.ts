import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// CORS is enabled on the API itself, so the dev server can call it
// cross-origin directly (VITE_API_BASE_URL) without needing a proxy.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: "dist" },
});
