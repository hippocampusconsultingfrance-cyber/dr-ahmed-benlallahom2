import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

// Dummy secrets, those of the CI, so that `pnpm test` passes on a fresh clone without any (CODE-11).
// A value set in the environment is kept; with these, no test reaches a real service.
const DUMMY_SECRETS = {
  RESEND_API_KEY: "re_test_dummy_key_12345678",
  STRIPE_SECRET_KEY: "sk_test_51N9oXjDummyKeyForContinuousIntegration000000",
  TURNSTILE_SECRET_KEY: "1x00000000000000000000AA",
  CANDIDATE_AUTH_PEPPER: "dummy_pepper_for_ci_testing_32_chars_long",
  CANDIDATE_DOCUMENT_ENCRYPTION_KEY:
    "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
  JWT_SECRET: "dummy_jwt_secret_for_ci_testing_32_chars_long",
  GOOGLE_DRIVE_CLIENT_ID: "dummy_client_id",
  GOOGLE_DRIVE_CLIENT_SECRET: "dummy_client_secret",
  GOOGLE_DRIVE_CV_FOLDER_ID: "dummy_ci_folder_id",
};

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
    env: Object.fromEntries(
      Object.entries(DUMMY_SECRETS).map(([name, dummy]) => [
        name,
        process.env[name] || dummy,
      ])
    ),
    // Critical screens mounted by React with Testing Library declare `// @vitest-environment happy-dom`.
    // Their DOM loads no script, style sheet or frame and never navigates, so no test reaches the network.
    environmentOptions: {
      happyDOM: {
        url: "https://drahmedbenlallahom.com/",
        settings: {
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          disableIframePageLoading: true,
          navigation: {
            disableMainFrameNavigation: true,
            disableChildFrameNavigation: true,
            disableChildPageNavigation: true,
          },
        },
      },
    },
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/**/*.test.ts",
      "client/**/*.spec.ts",
    ],
  },
});
