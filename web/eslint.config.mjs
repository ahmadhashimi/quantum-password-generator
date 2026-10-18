import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Secrets must never be rendered as raw HTML or reach the console.
      "react/no-danger": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["app/layout.tsx"],
    rules: { "react/no-danger": "off" }, // the nonce'd pre-hydration theme script
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "lib/api/schema.d.ts", "playwright-report/**",
                 "test-results/**"]),
]);
