import { defineConfig } from "oxlint";

export default defineConfig({
  env: {
    node: true,
  },
  ignorePatterns: ["**/dist/**", "**/node_modules/**"],
});
