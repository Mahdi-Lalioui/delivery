import colors from "./palettes.json" with { type: "json" };

const dark = { ...colors.dark, scrim: colors.light.scrim } satisfies typeof colors.light;

export const palettes = { light: colors.light, dark };
