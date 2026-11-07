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
