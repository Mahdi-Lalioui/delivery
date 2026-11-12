import { brand } from "@zaafran/config/brand";
import { getMessages } from "@zaafran/i18n/messages";
import { render, screen, userEvent } from "@testing-library/react-native";
import { HomeScreen } from "../src/home-screen";
import { isRtl, pickLocale } from "../src/locale";

test("[MOB-01] picks the first supported device language and falls back to French", () => {
  expect(pickLocale(["de", "ar", "fr"])).toBe("ar");
  expect(pickLocale([null, "en"])).toBe("en");
  expect(pickLocale(["de"])).toBe("fr");
  expect(isRtl("ar")).toBe(true);
  expect(isRtl("fr")).toBe(false);
});

test("[MOB-01] shows the Arabic home with an accessible start button", async () => {
  const onStart = jest.fn();
  const user = userEvent.setup();
  await render(<HomeScreen locale="ar" onStart={onStart} />);
  const copy = getMessages("ar").marketingLanding;
  expect(screen.getByRole("header")).toHaveTextContent(brand.arabicName);
  expect(screen.getByText(copy.intro)).toBeOnTheScreen();
  await user.press(screen.getByRole("button", { name: copy.start }));
  expect(onStart).toHaveBeenCalledTimes(1);
});
