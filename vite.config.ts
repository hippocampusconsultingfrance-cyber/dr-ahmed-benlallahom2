import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Fichiers hachés (JS, CSS, polices) dans /static, séparés des fichiers non hachés de
    // client/public/assets : vercel.json peut ainsi les servir avec un cache immuable d'un an
    // sans figer les photos ni les logos (CACHE-01).
    assetsDir: "static",
    // Let Rollup keep React, Radix and their shared primitives in a coherent
    // dependency graph. Manual vendor chunks created a framework↔Radix cycle
    // in production, leaving React undefined before the root could render.
    rollupOptions: {},
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
