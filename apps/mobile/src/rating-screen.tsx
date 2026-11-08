import { orderRatingInput } from "@zaafran/contracts/ratings";
import { getMessages } from "@zaafran/i18n/messages";
import { Card, fontSizes, PrimaryButton, StarRating, TextAreaField } from "@zaafran/ui-native";
import { IntlMessageFormat } from "intl-messageformat";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import type { AppLocale } from "./locale";
import { useTheme } from "./use-theme";

type RatingInput = ReturnType<typeof orderRatingInput.parse>;
type Field = "foodStars" | "deliveryStars" | "comment";
type Draft = { foodStars: number | undefined; deliveryStars: number | undefined; comment: string };

/** CUS-22 in the app: same contract and rules as the web (delivery stars only for delivery). */
export function validateRating(
  draft: Draft,
  isDelivery: boolean,
): { kind: "ready"; input: RatingInput } | { kind: "invalid"; field: Field } {
  if (draft.foodStars === undefined) return { kind: "invalid", field: "foodStars" };
  if (isDelivery && draft.deliveryStars === undefined)
    return { kind: "invalid", field: "deliveryStars" };
  const comment = draft.comment.trim();
  const parsed = orderRatingInput.safeParse({
    foodStars: draft.foodStars,
    ...(isDelivery && { deliveryStars: draft.deliveryStars }),
    ...(comment !== "" && { comment }),
  });
  if (parsed.success) return { kind: "ready", input: parsed.data };
  const field = parsed.error.issues[0]?.path[0];
  return {
    kind: "invalid",
    field: field === "comment" || field === "deliveryStars" ? field : "foodStars",
  };
}

const errorKeys = {
  foodStars: "foodStarsError",
  deliveryStars: "deliveryStarsError",
  comment: "commentError",
} as const;

export function RatingScreen(props: {
  locale: AppLocale;
  isDelivery: boolean;
  onSubmit: (input: RatingInput) => void;
}) {
  const theme = useTheme();
  const copy = getMessages(props.locale).retentionRatings;
  const [draft, setDraft] = useState<Draft>({
    foodStars: undefined,
    deliveryStars: undefined,
    comment: "",
  });
  const [invalid, setInvalid] = useState<Field>();
  const starLabel = (count: number) =>
    String(new IntlMessageFormat(copy.stars, props.locale).format({ count }));
  const error = (field: Field) => (invalid === field ? copy[errorKeys[field]] : undefined);
  return (
    <ScrollView
      contentContainerStyle={[
        styles.screen,
        { padding: theme.space["24"], gap: theme.space["20"], backgroundColor: theme.colors.bg },
      ]}
    >
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>
        {copy.title}
      </Text>
      <Text style={{ color: theme.colors["text-2"] }}>{copy.intro}</Text>
      <Card theme={theme}>
        <StarRating
          label={copy.food}
          value={draft.foodStars}
          starLabel={starLabel}
          theme={theme}
          isInvalid={invalid === "foodStars"}
          onChange={(foodStars) => {
            setDraft({ ...draft, foodStars });
          }}
        />
        {error("foodStars") !== undefined && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {error("foodStars")}
          </Text>
        )}
        {props.isDelivery && (
          <StarRating
            label={copy.delivery}
            value={draft.deliveryStars}
            starLabel={starLabel}
            theme={theme}
            isInvalid={invalid === "deliveryStars"}
            onChange={(deliveryStars) => {
              setDraft({ ...draft, deliveryStars });
            }}
          />
        )}
        {error("deliveryStars") !== undefined && (
          <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
            {error("deliveryStars")}
          </Text>
        )}
        <TextAreaField
          label={copy.comment}
          value={draft.comment}
          maxLength={500}
          error={error("comment")}
          theme={theme}
          onChangeText={(comment) => {
            setDraft({ ...draft, comment });
          }}
        />
        <PrimaryButton
          label={copy.submit}
          theme={theme}
          onPress={() => {
            const result = validateRating(draft, props.isDelivery);
            if (result.kind === "invalid") {
              setInvalid(result.field);
              return;
            }
            setInvalid(undefined);
            props.onSubmit(result.input);
          }}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1 },
  title: { fontSize: fontSizes.h1, fontWeight: "700" },
});
