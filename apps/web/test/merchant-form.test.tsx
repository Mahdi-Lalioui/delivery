import { getMessages } from "@zaafran/i18n/messages";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MerchantApplicationForm } from "../src/merchant/components/merchant-form";
import {
  useMerchantApplication,
  type MerchantApplicationState,
} from "../src/merchant/use-merchant-application";
import { useMerchantResource } from "../src/merchant/use-merchant-resource";

vi.mock("../src/merchant/use-merchant-application", () => ({ useMerchantApplication: vi.fn() }));
vi.mock("../src/merchant/use-merchant-resource", () => ({ useMerchantResource: vi.fn() }));

const retry = vi.fn();
const commune = {
  id: "019d6abc-1234-7234-8234-123456789abc",
  code: "1601",
  wilayaCode: 16,
  nameAr: "الجزائر الوسطى",
  nameFr: "Alger centre",
};
const application: MerchantApplicationState = {
  draft: {
    restaurantName: "Restaurant fictif",
    ownerName: "Propriétaire fictif",
    communeId: commune.id,
    latitude: "36.76",
    longitude: "3.06",
    cuisines: ["algerian"],
    rcNumber: "",
  },
  fields: [],
  error: undefined,
  pending: false,
  submitted: false,
  sessionChanged: false,
  update: vi.fn(),
  submit: vi.fn(),
};

function render(state: Partial<MerchantApplicationState> = {}) {
  vi.mocked(useMerchantApplication).mockReturnValue({ ...application, ...state });
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="fr-DZ" messages={{ merchant: getMessages("fr").merchant }}>
      <MerchantApplicationForm locale="fr" sessionId={commune.id} onRefreshAccount={retry} />
    </NextIntlClientProvider>,
  );
}

function readyCommune() {
  vi.mocked(useMerchantResource).mockReturnValue({
    view: { kind: "ready", data: [commune] },
    retry,
  });
}

test("[MER-01] an outside-commune rejection describes both editable coordinates", () => {
  readyCommune();
  const html = render({ error: "outsideCommune" });
  const { merchant } = getMessages("fr");
  expect(html).toContain(merchant.outsideCommune);
  expect(html.match(/aria-describedby="merchant-application-error"/g)).toHaveLength(2);
});

test("[MER-01] failed commune loading offers a retry and keeps submission unavailable", () => {
  vi.mocked(useMerchantResource).mockReturnValue({ view: { kind: "error" }, retry });
  const html = render();
  const { merchant } = getMessages("fr");
  expect(html).toContain(merchant.communesError);
  expect(html).toContain(merchant.retry);
  expect(html).toMatch(/<button\b(?=[^>]*type="submit")(?=[^>]*\bdisabled)/);
});

test("[MER-01] incomplete fields expose localized errors through their labels and descriptions", () => {
  readyCommune();
  const html = render({ fields: ["restaurantName", "communeId", "latitude", "cuisines"] });
  const { merchant } = getMessages("fr");

  expect(html).toContain(merchant.fixErrors);
  expect(html).toContain(merchant.invalidName);
  expect(html).toContain(merchant.invalidCommune);
  expect(html).toContain(merchant.invalidLatitude);
  expect(html).toContain(merchant.invalidCuisines);
  expect(html).toContain('aria-describedby="merchant-restaurantName-error"');
  expect(html).toContain('aria-describedby="merchant-commune-error"');
  expect(html).toContain('aria-describedby="merchant-cuisines-hint merchant-cuisines-error"');
});

test("[MER-01] expired sign-in replaces submit with the safe phone verification link", () => {
  readyCommune();
  const html = render({ error: "signInRequired" });

  expect(html).toContain(getMessages("fr").merchant.signInRequired);
  expect(html).toContain('href="/fr/sign-in?continue=merchant-apply"');
  expect(html).not.toContain('type="submit"');
});

test("[MER-01] submitting locks the form and a recorded application presents pending review", () => {
  readyCommune();
  expect(render({ pending: true })).toMatch(/<fieldset\b[^>]*\bdisabled=""/);
  const submitted = render({ submitted: true });
  expect(submitted).toContain(getMessages("fr").merchant.submittedTitle);
  expect(submitted).toContain(getMessages("fr").merchant.submittedDescription);
  expect(submitted).not.toContain("<form");
});

test("[MER-01] a changed account discards visible draft values and offers an explicit refresh", () => {
  readyCommune();
  const html = render({ sessionChanged: true });
  const { merchant } = getMessages("fr");

  expect(html).toContain(merchant.sessionChanged);
  expect(html).toContain(merchant.refreshAccount);
  expect(html).not.toContain("<form");
  expect(html).not.toContain(application.draft.restaurantName);
  expect(html).not.toContain(application.draft.ownerName);
});
