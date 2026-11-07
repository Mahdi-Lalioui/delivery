import { palettes } from "./colors.ts";
import metrics from "./metrics.json" with { type: "json" };

function declarations(prefix: string, tokens: Readonly<Record<string, string>>): string[] {
  return Object.entries(tokens).map(([name, value]) => `--${prefix}${name}: ${value};`);
}

function block(selector: string, lines: readonly string[]): string[] {
  return [`${selector} {`, ...lines.map((line) => `  ${line}`), "}"];
}

function arabicTypography(): string[] {
  const { body, label, caption } = metrics.scale["font-size"];
  const { fontSizeIncrement, lineHeightMultiplier, properties } = metrics.arabic;
  const sizes = Object.entries({ body, label, caption }).map(
    ([role, value]) => `--font-size-${role}: calc(${value} + ${fontSizeIncrement});`,
  );
  const lineHeights = Object.entries(metrics.scale["line-height"]).map(
    ([role, value]) => `--line-height-${role}: calc(${String(lineHeightMultiplier)} * ${value});`,
  );

  return [...declarations("", properties), ...sizes, ...lineHeights];
}

export function renderTheme(): string {
  const light = [
    "color-scheme: light;",
    ...declarations("color-", palettes.light),
    ...Object.entries(metrics.scale).flatMap(([group, tokens]) =>
      declarations(`${group}-`, tokens),
    ),
    ...declarations("", metrics.common),
    ...declarations("", metrics.elevation.light),
  ];
  const dark = [
    "color-scheme: dark;",
    ...declarations("color-", palettes.dark),
    ...declarations("", metrics.elevation.dark),
  ];
  const rules = [
    block(":root", light),
    block(
      "@media (prefers-color-scheme: dark)",
      block(':root:not([data-theme="light"], [data-theme="dark"])', dark),
    ),
    block(':root[data-theme="dark"]', dark),
    block(":root:lang(ar)", arabicTypography()),
    block(
      `@media (min-width: ${metrics.widePage.minWidth})`,
      block(":root", [`--page-padding: ${metrics.widePage.padding};`]),
    ),
  ];

  return `/* Generated from the design tokens. */\n${rules.map((rule) => rule.join("\n")).join("\n\n")}\n`;
}
