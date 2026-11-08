import { Pressable, StyleSheet, Text, View } from "react-native";
import { fontSizes, type Theme } from "./theme";

const stars = [1, 2, 3, 4, 5] as const;
const glyph = "★";

/**
 * DESIGN §10 Rating input: five 52 pt targets announced as a radio group; the chosen star and all
 * before it are saffron. Layout follows the app direction (RTL fills from the right).
 */
export function StarRating(props: {
  label: string;
  value: number | undefined;
  starLabel: (count: number) => string;
  theme: Theme;
  isInvalid?: boolean;
  onChange: (value: number) => void;
}) {
  const { theme } = props;
  const idle = props.isInvalid === true ? theme.colors.danger : theme.colors["border-strong"];
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      style={{ gap: theme.space["8"] }}
    >
      <Text style={[styles.label, { color: theme.colors.text }]}>{props.label}</Text>
      <View style={styles.row}>
        {stars.map((star) => {
          const isOn = props.value !== undefined && star <= props.value;
          return (
            <Pressable
              key={star}
              accessibilityRole="radio"
              accessibilityLabel={props.starLabel(star)}
              accessibilityState={{ checked: props.value === star }}
              hitSlop={4}
              onPress={() => {
                props.onChange(star);
              }}
              style={({ pressed }) => [
                styles.star,
                {
                  width: theme.touchTarget.customerPrimary,
                  height: theme.touchTarget.customerPrimary,
                  transform: [{ scale: pressed ? 0.9 : 1 }],
                },
              ]}
            >
              <Text style={[styles.glyph, { color: isOn ? theme.colors.primary : idle }]}>
                {glyph}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSizes.body, fontWeight: "600" },
  row: { flexDirection: "row" },
  star: { alignItems: "center", justifyContent: "center" },
  glyph: { fontSize: fontSizes.h1 },
});
