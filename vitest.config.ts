import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  // Même runtime JSX que l'application (@vitejs/plugin-react) pour les tests qui rendent des composants.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Critical screens mounted by React with Testing Library declare `// @vitest-environment happy-dom`.
    // Their DOM loads no script, style sheet or frame and never navigates, so no test reaches the network.
    environmentOptions: {
      happyDOM: {
        url: "https://drahmedbenlallahom.com/",
        settings: {
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          disableIframePageLoading: true,
          navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true, disableChildPageNavigation: true },
        },
      },
    },
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/**/*.test.ts", "client/**/*.spec.ts"],
  },
});
