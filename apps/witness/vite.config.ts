import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Port 5173 is what the ingestion service allows in CORS_ORIGINS and what e2e (BASE_URL_WITNESS) expects.
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
