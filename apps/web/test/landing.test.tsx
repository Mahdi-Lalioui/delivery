import { getMessages } from "@zaafran/i18n/messages";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CasbahHero } from "../src/marketing/casbah-hero";
import { CasbahPoster, heroSeed } from "../src/marketing/casbah-poster";
import { buildCasbahScene } from "../src/marketing/casbah-scene";

test("[M8-1] the poster draws every house of the seeded scene with an accessible label", () => {
  const { marketingLanding } = getMessages("ar");
  const html = renderToStaticMarkup(<CasbahPoster label={marketingLanding.heroImage} />);
  expect(html).toContain('role="img"');
  expect(html).toContain(`aria-label="${marketingLanding.heroImage}"`);
  expect(html.match(/class="casbah-wall"/g)).toHaveLength(buildCasbahScene(heroSeed).houses.length);
  expect(html).toContain('class="casbah-trail"');
  // The sky is DESIGN's golden-hour gradient in both themes.
  expect(html).toContain('stop-color="#F6AE3E"');
  expect(html).toContain('stop-color="#C2410C"');
});

test("[M8-1] the hero renders the poster on the server and no canvas until the client opts in", () => {
  const html = renderToStaticMarkup(
    <CasbahHero seed={heroSeed} homeTargetId="landing-start" poster={<CasbahPoster label="x" />} />,
  );
  expect(html).toContain('data-hero="poster"');
  expect(html).toContain("casbah-poster");
  expect(html).not.toContain("<canvas");
});
