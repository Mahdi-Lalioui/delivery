import { expect, test } from "vitest";
import { palettes } from "../src/colors.ts";

type Theme = "light" | "dark";
type ColorToken = keyof (typeof palettes)[Theme];
type ContrastPair<Token extends string> = readonly [
  foreground: Token,
  background: Token,
  minimum: number,
];

// DESIGN §3.3, with one entry per foreground and background combination.
const pairs: readonly ContrastPair<ColorToken>[] = [
  ["text", "bg", 7],
  ["text", "surface", 7],
  ["text", "surface-2", 7],
  ["text-2", "bg", 4.5],
  ["text-2", "surface", 4.5],
  ["text-2", "surface-2", 4.5],
  ["text-3", "bg", 4.5],
  ["text-3", "surface", 4.5],
  ["text-3", "surface-2", 4.5],
  ["on-primary", "primary", 4.5],
  ["on-primary", "primary-hover", 4.5],
  ["on-primary", "primary-pressed", 4.5],
  ["on-harissa", "harissa", 4.5],
  ["harissa-text", "bg", 4.5],
  ["info", "bg", 4.5],
  ["success", "bg", 4.5],
  ["warning", "bg", 4.5],
  ["danger", "bg", 4.5],
  ["info", "info-bg", 4.5],
  ["success", "success-bg", 4.5],
  ["warning", "warning-bg", 4.5],
  ["danger", "danger-bg", 4.5],
  ["link", "bg", 4.5],
  ["link", "surface", 4.5],
  ["danger", "surface", 4.5],
  ["border-strong", "bg", 3],
  ["border-strong", "surface", 3],
  ["focus", "bg", 3],
  ["focus", "surface", 3],
];

function linearizeChannel(hex: string): number {
  const channel = Number.parseInt(hex, 16) / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  expect(hex, "Contrast pairs must use opaque #RRGGBB colors").toMatch(/^#[\da-f]{6}$/i);
  const red = linearizeChannel(hex.slice(1, 3));
  const green = linearizeChannel(hex.slice(3, 5));
  const blue = linearizeChannel(hex.slice(5, 7));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function assertContrast<Token extends string>(
  palette: Readonly<Record<Token, string>>,
  [foreground, background, minimum]: ContrastPair<Token>,
  label: string,
): void {
  const foregroundLuminance = luminance(palette[foreground]);
  const backgroundLuminance = luminance(palette[background]);
  const brighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  const ratio = (brighter + 0.05) / (darker + 0.05);
  const requirement = `${label} ${foreground} on ${background} must reach ${String(minimum)}:1`;
  expect(ratio, requirement).toBeGreaterThanOrEqual(minimum);
}

const themes: readonly Theme[] = ["light", "dark"];

for (const theme of themes) {
  test.each(pairs)(`[M0-9] ${theme} %s on %s reaches %s:1`, (foreground, background, minimum) => {
    assertContrast(palettes[theme], [foreground, background, minimum], theme);
  });
}

test("[M0-9] rejects a ratio just below the minimum even when it rounds up", () => {
  const fixture = { text: "#777777", bg: "#FFFFFF" };

  expect(() => {
    assertContrast(fixture, ["text", "bg", 4.5], "fixture");
  }).toThrow("fixture text on bg must reach 4.5:1");
});
