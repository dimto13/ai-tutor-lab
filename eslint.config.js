import appsync from "@aws-appsync/eslint-plugin";
import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist",
      "**/.output",
      "**/.vinxi",
      "**/.tanstack",
      "**/.amplify-hosting",
      "**/.amplify",
      "**/.nitro",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // AppSync JS resolvers run in the restricted APPSYNC_JS runtime, not in Node. Use AWS' full
    // recommended rules with a dedicated JavaScript-aware TypeScript project so unsupported
    // methods and function-passing fail locally instead of during a real AppSync deployment.
    ...appsync.configs.recommended,
    files: ["amplify/data/**/*.js"],
    languageOptions: {
      ...(appsync.configs.recommended.languageOptions ?? {}),
      parserOptions: {
        ...(appsync.configs.recommended.languageOptions?.parserOptions ?? {}),
        project: "./amplify/data/tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/*", "**/apps/web/**", "../../apps/web/**", "../../../apps/web/**"],
              message:
                "Packages must not depend on apps/web. Dependency direction is apps -> packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/training-engine/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "training-engine must stay framework-free." },
            { name: "react-dom", message: "training-engine must stay framework-free." },
          ],
          patterns: [
            {
              group: ["@/*", "**/apps/web/**", "../../apps/web/**", "../../../apps/web/**"],
              message: "training-engine must not import the web application.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
