import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeGlobals = {
  AbortController: "readonly",
  Buffer: "readonly",
  DOMException: "readonly",
  Headers: "readonly",
  NodeJS: "readonly",
  RequestInit: "readonly",
  console: "readonly",
  clearTimeout: "readonly",
  fetch: "readonly",
  process: "readonly",
  setTimeout: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "repomix-output.xml",
      "router-dumps/**",
      "tests/fixtures/expected/**",
      "tests/fixtures/parsed/**",
      "tests/fixtures/router-html/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      globals: nodeGlobals,
      sourceType: "module",
    },
  },
  {
    files: ["**/*.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      globals: nodeGlobals,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
);
