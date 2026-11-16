import { expect, test } from "vitest";
import { renderTheme } from "../src/theme.ts";

test("[M0-8] generates a stylesheet with light defaults and dark preference and override rules", () => {
  const stylesheet = renderTheme();

  expect(stylesheet).toMatch(/:root \{[^}]*color-scheme: light;[^}]*--color-bg: #FBF8F3;/);
  expect(stylesheet).toMatch(
    /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\], \[data-theme="dark"\]\) \{[^}]*color-scheme: dark;[^}]*--color-bg: #0E0C0A;/,
  );
  expect(stylesheet).toMatch(
    /:root\[data-theme="dark"\] \{[^}]*color-scheme: dark;[^}]*--color-bg: #0E0C0A;[^}]*--shadow-e1: none;/,
  );
});

test("[M0-8] generates Arabic typography overrides and the wider mobile page padding", () => {
  const stylesheet = renderTheme();

  expect(stylesheet).toMatch(/:root:lang\(ar\) \{[^}]*--font-size-body: calc\(15px \+ 1px\);/);
  expect(stylesheet).toMatch(
    /@media \(min-width: 400px\) \{\s*:root \{\s*--page-padding: var\(--space-20\);/,
  );
});

test("[M0-8] generates the DESIGN §7 motion durations and easings and the §6 photo fade", () => {
  const stylesheet = renderTheme();
  const root = /:root \{([^}]*)\}/.exec(stylesheet)?.[1] ?? "";

  for (const declaration of [
    "--duration-instant: 80ms;",
    "--duration-fast: 140ms;",
    "--duration-base: 220ms;",
    "--duration-slow: 320ms;",
    "--duration-emphasis: 480ms;",
    "--duration-scene-min: 900ms;",
    "--duration-scene-max: 1400ms;",
    "--duration-photo-fade: 180ms;",
    "--ease-standard: cubic-bezier(0.2, 0, 0, 1);",
    "--ease-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);",
    "--ease-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);",
  ]) {
    expect(root).toContain(declaration);
  }
});

test("[M0-8] caps every motion duration at a 120 ms fade under reduced motion", () => {
  const stylesheet = renderTheme();
  const reduced = /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{([^}]*)\}/.exec(
    stylesheet,
  )?.[1];

  expect(reduced).toBeDefined();
  const durations = [...(reduced ?? "").matchAll(/--duration-([a-z-]+): (\d+)ms;/g)];
  expect(durations.map(([, name]) => name)).toEqual([
    "instant",
    "fast",
    "base",
    "slow",
    "emphasis",
    "scene-min",
    "scene-max",
    "photo-fade",
  ]);
  expect(reduced).toContain("--duration-instant: 80ms;");
  for (const [, name, value] of durations) {
    if (name !== "instant") expect(value).toBe("120");
  }
});
