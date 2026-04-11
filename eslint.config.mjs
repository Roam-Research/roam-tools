import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["**/dist/", "**/node_modules/", "**/*.tsbuildinfo", ".claude/"],
  },

  // Base JS recommended rules for all files
  eslint.configs.recommended,

  // TypeScript files: recommended rules (non-type-aware)
  {
    files: ["packages/*/src/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    rules: {
      // Allow unused vars when prefixed with underscore
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Warn for now — existing `as any` casts in client.ts
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Script files (.mjs) — just base JS rules with node globals
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },

  // Prettier compat: must be LAST to override conflicting rules
  eslintConfigPrettier,
);
