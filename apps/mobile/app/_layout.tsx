import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { I18nManager } from "react-native";
import { deviceLocale, isRtl } from "../src/locale";

export default function RootLayout() {
  useEffect(() => {
    // Takes effect on the next launch; Expo reloads when the device language changes.
    const shouldBeRtl = isRtl(deviceLocale());
    I18nManager.allowRTL(true);
    if (I18nManager.isRTL !== shouldBeRtl) I18nManager.forceRTL(shouldBeRtl);
  }, []);
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
