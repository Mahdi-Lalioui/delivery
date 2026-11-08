import eslint from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import typescript from "typescript-eslint";

const typescriptFiles = ["**/*.{ts,tsx,mts,cts}"];

export function createEslintConfig(tsconfigRootDir) {
  return [
    {
      ignores: [
        "**/.next/**",
        "**/.next-dev/**",
        "**/.next-design/**",
        "**/.turbo/**",
        "**/.expo/**",
        "**/build/**",
        "**/dist/**",
        "**/coverage/**",
        "**/reports/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/next-env.d.ts",
        ".worktrees/**",
      ],
    },
    eslint.configs.recommended,
    {
      rules: {
        complexity: ["error", 10],
        "max-depth": ["error", 3],
        "max-params": ["error", 3],
        "no-console": "error",
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
    },
    ...typescript.configs.strictTypeChecked.map((config) => ({
      ...config,
      files: typescriptFiles,
    })),
    {
      files: typescriptFiles,
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/no-unsafe-type-assertion": "error",
      },
    },
    {
      files: ["packages/domain/src/**/*.{ts,tsx,mts,cts}"],
      ignores: ["**/*.{spec,test}.{ts,tsx,mts,cts}"],
      rules: {
        "no-restricted-globals": ["error", "fetch", "process", "crypto"],
        "no-restricted-properties": [
          "error",
          { object: "Date", property: "now", message: "Use the injected clock." },
          { object: "Math", property: "random", message: "Use the injected generator." },
        ],
        "no-restricted-syntax": [
          "error",
          {
            selector: "NewExpression[callee.name='Date'][arguments.length=0]",
            message: "Use the injected clock.",
          },
        ],
      },
    },
    prettier,
  ];
}
