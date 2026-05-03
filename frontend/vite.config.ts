import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vite config: alias @ → ./src so imports look like `@/components/...`,
// matching the convention shadcn/ui uses out of the box.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { port: 5173 },
  preview: { port: 4500, host: true },
});
