import type { ReactNode } from "react";
import { StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from "react-native";
import { fontSizes, type Theme } from "./theme";

/** DESIGN §10 card surface. */
export function Card({ theme, children }: { theme: Theme; children: ReactNode }) {
  return (
    <View
      style={{
        gap: theme.space["16"],
        padding: theme.space["20"],
        borderRadius: theme.radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors["border-subtle"],
        backgroundColor: theme.colors.surface,
      }}
    >
      {children}
    </View>
  );
}

/** A labelled multi-line field with an inline error. */
export function TextAreaField(
  props: Omit<TextInputProps, "style"> & {
    label: string;
    error?: string | undefined;
    theme: Theme;
  },
) {
  const { label, error, theme, ...input } = props;
  return (
    <View style={{ gap: theme.space["8"] }}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        multiline
        placeholderTextColor={theme.colors["text-3"]}
        style={[
          styles.area,
          {
            minHeight: theme.space["120"],
            padding: theme.space["12"],
            borderRadius: theme.radius.md,
            borderColor: error === undefined ? theme.colors["border-strong"] : theme.colors.danger,
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
          },
        ]}
      />
      {error !== undefined && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
}

/** DESIGN §10 Toggle as a native switch row. */
export function SwitchRow(props: {
  label: string;
  description?: string;
  value: boolean;
  theme: Theme;
  onChange: (value: boolean) => void;
}) {
  const { theme } = props;
  return (
    <View style={[styles.switchRow, { gap: theme.space["16"], minHeight: theme.touchTarget.min }]}>
      <View style={[styles.switchText, { gap: theme.space["4"] }]}>
        <Text style={[styles.label, { color: theme.colors.text }]}>{props.label}</Text>
        {props.description !== undefined && (
          <Text style={{ color: theme.colors["text-3"] }}>{props.description}</Text>
        )}
      </View>
      <Switch
        accessibilityLabel={props.label}
        value={props.value}
        onValueChange={props.onChange}
        trackColor={{ true: theme.colors.primary, false: theme.colors["surface-3"] }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSizes.body, fontWeight: "600" },
  area: { borderWidth: 1, textAlignVertical: "top", fontSize: fontSizes.body },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchText: { flex: 1 },
});
