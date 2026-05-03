import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Backend agent server runs on :4310 by default. Override with
// VITE_API_TARGET if you've moved it. The proxy makes /api/* same-origin
// so EventSource and fetch don't need any CORS shenanigans.
const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:4310";

const proxy = {
  "/api": {
    target: API_TARGET,
    changeOrigin: true,
    // SSE needs the connection to stay open and uncompressed.
    ws: false,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { port: 5173, proxy },
  preview: { port: 4500, host: true, proxy },
});
