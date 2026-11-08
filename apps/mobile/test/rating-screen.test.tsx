import { getMessages } from "@zaafran/i18n/messages";
import { render, screen, userEvent } from "@testing-library/react-native";
import { RatingScreen, validateRating } from "../src/rating-screen";

const copy = getMessages("fr").retentionRatings;

test("[CUS-22][MOB-01] validates like the web: delivery stars only for delivery, comment trimmed", () => {
  expect(validateRating({ foodStars: undefined, deliveryStars: 4, comment: "" }, true)).toEqual({
    kind: "invalid",
    field: "foodStars",
  });
  expect(validateRating({ foodStars: 5, deliveryStars: undefined, comment: "" }, true)).toEqual({
    kind: "invalid",
    field: "deliveryStars",
  });
  expect(
    validateRating({ foodStars: 5, deliveryStars: undefined, comment: "  Top  " }, false),
  ).toEqual({
    kind: "ready",
    input: { foodStars: 5, comment: "Top" },
  });
  expect(
    validateRating({ foodStars: 5, deliveryStars: 4, comment: "x".repeat(501) }, true),
  ).toEqual({ kind: "invalid", field: "comment" });
});

test("[CUS-22][MOB-01] rates with accessible stars and submits the contract input", async () => {
  const onSubmit = jest.fn();
  const user = userEvent.setup();
  await render(<RatingScreen locale="fr" isDelivery onSubmit={onSubmit} />);
  await user.press(screen.getByRole("button", { name: copy.submit }));
  expect(screen.getByText(copy.foodStarsError)).toBeOnTheScreen();
  const [foodFour] = screen.getAllByRole("radio", { name: "4 étoiles" });
  const [, deliveryFive] = screen.getAllByRole("radio", { name: "5 étoiles" });
  if (foodFour === undefined || deliveryFive === undefined) throw new Error("stars missing");
  await user.press(foodFour);
  await user.press(deliveryFive);
  expect(foodFour).toBeChecked();
  await user.press(screen.getByRole("button", { name: copy.submit }));
  expect(onSubmit).toHaveBeenCalledWith({ foodStars: 4, deliveryStars: 5 });
});
