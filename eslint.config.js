import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// ESLint (CODE-04): its recommended rules and typescript-eslint's, without those that need the
// types (`pnpm check` reads them), on the site's code, its tests, scripts and end-to-end
// scenarios, and the two rules of React's hooks on the React code. `pnpm lint` fails on any
// warning; a rule turned off on one line says why there. server/ciWorkflow.test.ts lists this
// file as it is.
export default defineConfig(
  // The build, the table scripts/generate-docx-font-metrics.mjs writes, and the copies of the
  // repository that local tools keep (.claude).
  globalIgnores([
    "dist/",
    "api/index.js",
    "drizzle/pg/meta/",
    "server/docxFontMetrics.ts",
    ".claude/",
  ]),
  {
    files: [
      "{client/src,server,shared,scripts,e2e}/**/*.{js,mjs,cjs,ts,mts,cts,tsx}",
    ],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      // A name that starts with `_` is unused on purpose: a parameter that gives a mock its
      // signature, a property left out of a copy.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  }
);
