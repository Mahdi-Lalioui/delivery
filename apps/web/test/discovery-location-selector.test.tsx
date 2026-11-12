import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DiscoveryLocationSelector } from "../src/discovery/discovery-location-selector";

test("[CUS-02] the first visit offers an Arabic delivery location prompt", () => {
  const html = renderToStaticMarkup(
    <DiscoveryLocationSelector locale="ar" saved={null} onConfirm={() => undefined} />,
  );
  expect(html).toMatch(/<button[^>]+aria-haspopup="dialog"[^>]*>/);
  expect(html).toContain("اختيار عنوان");
  expect(html).toContain("أين تريد استلام طلبك؟");
});

test("[CUS-02] a saved location keeps its visible name in the button’s accessible name", () => {
  const html = renderToStaticMarkup(
    <DiscoveryLocationSelector
      locale="fr"
      saved={{
        location: { latitude: 36.77, longitude: 3.05, communeId: null, serviceAreaId: null },
        commune: { nameAr: "الجزائر الوسطى", nameFr: "Alger Centre" },
      }}
      onConfirm={() => undefined}
    />,
  );
  expect(html).not.toMatch(/<button[^>]*aria-label=/u);
  expect(html).toContain('class="ui-visually-hidden">Modifier le lieu de livraison');
  expect(html).toContain("Alger Centre");
});
