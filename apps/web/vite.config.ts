import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Minimal Vite config for this auth-foundation UI. The full
// SplitFlow frontend build configuration (proxying, env validation,
// etc.) is future scope — see docs/architecture.md.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
