import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isDevMode = process.env.NODE_ENV === "development";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": isDevMode ? '"development"' : '"production"',
  },
  plugins: [
    react({
      jsxRuntime: isDevMode ? undefined : "classic",
    }),
  ],
  build: {
    outDir: "extension/content_scripts",
    lib: {
      entry: ["src/extension.tsx"],
      name: "biai_extension_1",
      fileName: () => {
        return `biai-extension-1.min.js`;
      },
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        format: "iife",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") {
            return "biai-extension-1.min.css";
          }

          return assetInfo.name;
        },
      },
    },
    target: "esnext",
    sourcemap: false,
  },
  css: {
    modules: {
      generateScopedName: "biai-extension-1-[hash:base64:4]",
    },
  },
});
