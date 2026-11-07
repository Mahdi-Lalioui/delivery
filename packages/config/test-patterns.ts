const generated = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/.next*/**",
  "**/coverage/**",
];

export const unitTestPatterns = {
  include: ["{apps,packages}/**/*.{test,spec}.{ts,tsx}"],
  exclude: [
    ...generated,
    "**/{integration,e2e}/**",
    "**/*.{int,integration,e2e}.{test,spec}.{ts,tsx}",
    "apps/{mobile,partner}/**",
    "packages/ui-native/**",
  ],
};

export const integrationTestPatterns = {
  include: ["{apps,packages}/**/*.{int,integration}.{test,spec}.{ts,tsx}"],
  exclude: generated,
};

export const browserTestPattern = "**/*.spec.ts";
