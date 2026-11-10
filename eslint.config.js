import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "data/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ["src/web/client/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // web and mcp may only use core through its public interface.
    files: ["src/web/**/*.{ts,tsx}", "src/mcp/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/core/*", "!**/core/index.ts"],
              message: "Import core only through src/core/index.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    // The browser cannot open the database. It talks to the local server over /api.
    files: ["src/web/client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/core/**", "**/core"],
              message: "The browser talks to core through the /api server, not by import.",
            },
          ],
        },
      ],
    },
  },
);
