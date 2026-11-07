module.exports = {
  forbidden: [
    {
      name: "no-circular-dependencies",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-unresolved-dependencies",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "packages-do-not-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-are-independent",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "clients-do-not-import-database",
      severity: "error",
      from: { path: "^(?:apps/(?:web|mobile|partner)|packages/(?:ui|ui-native))/" },
      to: { path: "^packages/db/" },
    },
    {
      name: "domain-has-no-workspace-dependencies",
      severity: "error",
      from: { path: "^packages/domain/" },
      to: { path: "^(?:apps|packages)/", pathNot: "^packages/domain/" },
    },
    {
      name: "domain-runtime-has-no-external-dependencies",
      severity: "error",
      from: { path: "^packages/domain/src/", pathNot: "\\.(?:test|spec)\\.[cm]?tsx?$" },
      to: { pathNot: "^(?:apps|packages)/" },
    },
  ],
  options: {
    doNotFollow: { path: "(?:^|/)node_modules(?:/|$)" },
    exclude: {
      path: [
        "^(?:\\.(?:git|turbo|stryker-tmp|worktrees)|coverage|dist|playwright-report|test-results)(?:/|$)",
        "^(?:apps|packages)/[^/]+/(?:\\.next|\\.next-dev|\\.next-design|\\.expo|coverage|dist)(?:/|$)",
      ],
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "require", "node", "default"],
    },
    tsPreCompilationDeps: true,
  },
};
