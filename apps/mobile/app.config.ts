import { brand } from "@zaafran/config/brand";
import type { ExpoConfig } from "expo/config";

// The display name comes from the single brand file (AGENTS.md: the real name lives only there).
const config: ExpoConfig = {
  name: brand.name,
  slug: "zaafran-customer",
  scheme: "zaafran",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: { bundleIdentifier: "dz.zaafran.customer", supportsTablet: false },
  android: { package: "dz.zaafran.customer" },
  plugins: ["expo-router", "expo-localization"],
  // Arabic is a first-class layout: allow RTL and force it when the language is Arabic.
  extra: { supportsRTL: true },
  experiments: { typedRoutes: true },
};

export default config;
