import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        minify: mode === "production" ? {
          compress: {
            treeshake: {
              manualPureFunctions: ["console.log", "console.debug", "console.info"],
            },
          },
        } : false,
      },
    },
  },
}));
