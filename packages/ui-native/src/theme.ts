import metrics from "@zaafran/tokens/metrics.json";
import palettes from "@zaafran/tokens/palettes.json";

// React Native theme built from the same token files as the web CSS (DESIGN §3), so both apps
// share one source of truth. CSS-only values (clamp(), var()) stay on the web.

type Palette = typeof palettes.light;
export type ColorScheme = "light" | "dark";
export type Theme = {
  colors: Palette;
  space: Readonly<Record<keyof typeof metrics.scale.space, number>>;
  radius: Readonly<Record<keyof typeof metrics.scale.radius, number>>;
  touchTarget: { min: number; customerPrimary: number };
  /** DESIGN §7 durations in milliseconds, for Reanimated. */
  motion: { instant: number; fast: number; base: number; slow: number; emphasis: number };
};

function px(value: string): number {
  return Number.parseFloat(value);
}

const space = metrics.scale.space;
const radius = metrics.scale.radius;

const shared = {
  space: {
    "4": px(space["4"]),
    "8": px(space["8"]),
    "12": px(space["12"]),
    "16": px(space["16"]),
    "20": px(space["20"]),
    "24": px(space["24"]),
    "32": px(space["32"]),
    "40": px(space["40"]),
    "48": px(space["48"]),
    "64": px(space["64"]),
    "80": px(space["80"]),
    "120": px(space["120"]),
  },
  radius: {
    xs: px(radius.xs),
    sm: px(radius.sm),
    md: px(radius.md),
    lg: px(radius.lg),
    xl: px(radius.xl),
    pill: px(radius.pill),
  },
  touchTarget: {
    min: px(metrics.common["touch-target-min"]),
    customerPrimary: px(metrics.common["touch-target-customer-primary"]),
  },
  motion: { instant: 80, fast: 140, base: 220, slow: 320, emphasis: 480 },
};

/** Fixed font sizes in points; the fluid display sizes are web-only (clamp()). */
export const fontSizes = {
  h1: px(metrics.scale["font-size"].h1),
  h2: px(metrics.scale["font-size"].h2),
  "body-lg": px(metrics.scale["font-size"]["body-lg"]),
  body: px(metrics.scale["font-size"].body),
} as const;

// Dark keeps the light scrim, as in packages/tokens/src/colors.ts.
const dark: Palette = { ...palettes.dark, scrim: palettes.light.scrim };

export const themes: Readonly<Record<ColorScheme, Theme>> = {
  light: { ...shared, colors: palettes.light },
  dark: { ...shared, colors: dark },
};
