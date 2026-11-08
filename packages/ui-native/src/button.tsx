import { Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import { fontSizes, type Theme } from "./theme";

type Props = Omit<PressableProps, "children" | "style"> & { label: string; theme: Theme };

/** Primary customer button: saffron, 52 pt tall, press feedback by scale (DESIGN §7). */
export function PrimaryButton({ label, theme, ...pressable }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: theme.touchTarget.customerPrimary,
          paddingHorizontal: theme.space["24"],
          borderRadius: theme.radius.pill,
          backgroundColor: pressed ? theme.colors["primary-pressed"] : theme.colors.primary,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
      {...pressable}
    >
      <Text style={[styles.label, { color: theme.colors["on-primary"] }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  label: { fontSize: fontSizes["body-lg"], fontWeight: "600" },
});
