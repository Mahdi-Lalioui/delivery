import { brand } from "@zaafran/config/brand";
import { getMessages } from "@zaafran/i18n/messages";
import { fontSizes, PrimaryButton } from "@zaafran/ui-native";
import { StyleSheet, Text, View } from "react-native";
import { isRtl, type AppLocale } from "./locale";
import { useTheme } from "./use-theme";

/** M10 first screen: brand, the landing promise and the start button, in the device language. */
export function HomeScreen({ locale, onStart }: { locale: AppLocale; onStart: () => void }) {
  const theme = useTheme();
  const copy = getMessages(locale).marketingLanding;
  const name = locale === "ar" ? brand.arabicName : brand.name;
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.colors.bg, padding: theme.space["24"], gap: theme.space["16"] },
      ]}
      accessibilityLanguage={locale}
    >
      <Text
        accessibilityRole="header"
        style={[
          styles.title,
          { color: theme.colors.text, writingDirection: isRtl(locale) ? "rtl" : "ltr" },
        ]}
      >
        {name}
      </Text>
      <Text style={[styles.body, { color: theme.colors["text-2"] }]}>{copy.intro}</Text>
      <PrimaryButton label={copy.start} theme={theme} onPress={onStart} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center" },
  title: { fontSize: fontSizes.h1, fontWeight: "700" },
  body: { fontSize: fontSizes["body-lg"] },
});
