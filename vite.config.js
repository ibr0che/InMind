import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development, requests to /api are forwarded to the Node backend, so the
// browser only ever talks to one origin (no CORS setup needed locally).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
