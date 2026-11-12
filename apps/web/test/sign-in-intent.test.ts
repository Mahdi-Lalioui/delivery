import { expect, test } from "vitest";
import { readSignInIntent } from "../src/auth/sign-in-intent";

test("[MER-01:web] uses standard phone verification for a localized restaurant signup", () => {
  expect(readSignInIntent({ continue: "merchant-apply", purpose: "admin" }, "ar")).toEqual({
    purpose: "sign_in",
    subpath: "/sign-in?continue=merchant-apply",
    destination: { href: "/ar/merchant/apply", label: "continueApplication" },
  });
});

test("[ADM-03:web] requires admin verification for the localized review queue", () => {
  expect(readSignInIntent({ continue: "admin-review" }, "fr")).toEqual({
    purpose: "admin_sign_in",
    subpath: "/sign-in?continue=admin-review",
    destination: { href: "/fr/admin/merchant-applications", label: "continueReview" },
  });
  expect(readSignInIntent({ continue: "admin-review" }, "ar")).toEqual({
    purpose: "admin_sign_in",
    subpath: "/sign-in?continue=admin-review",
    destination: { href: "/ar/admin/merchant-applications", label: "continueReview" },
  });
});

test("[ADM-04:web] requires admin verification for the localized held-item queue", () => {
  expect(readSignInIntent({ continue: "admin-moderation" }, "en")).toEqual({
    purpose: "admin_sign_in",
    subpath: "/sign-in?continue=admin-moderation",
    destination: { href: "/en/admin/menu-items", label: "continueModeration" },
  });
  expect(readSignInIntent({ continue: "admin-moderation" }, "ar")).toEqual({
    purpose: "admin_sign_in",
    subpath: "/sign-in?continue=admin-moderation",
    destination: { href: "/ar/admin/menu-items", label: "continueModeration" },
  });
});

test.each([
  "https://example.invalid",
  "//example.invalid",
  "/fr/merchant/apply",
  ["merchant-apply"],
])("[AUTH-06] rejects arbitrary or repeated return targets", (value) => {
  expect(readSignInIntent({ continue: value, purpose: "admin" }, "en")).toEqual({
    purpose: "admin_sign_in",
    subpath: "/sign-in?purpose=admin",
  });
});

test("[MER-09:web] returns an authenticated restaurant editor to the localized restaurant list", () => {
  expect(readSignInIntent({ continue: "merchant-status", purpose: "admin" }, "fr")).toEqual({
    purpose: "sign_in",
    subpath: "/sign-in?continue=merchant-status",
    destination: { href: "/fr/merchant", label: "continueRestaurants" },
  });
});

test("[MER-23:web] returns an invitee to the localized staff invitation page", () => {
  expect(readSignInIntent({ continue: "staff-accept", purpose: "admin" }, "ar")).toEqual({
    purpose: "sign_in",
    subpath: "/sign-in?continue=staff-accept",
    destination: { href: "/ar/staff/accept", label: "continueInvitation" },
  });
});
