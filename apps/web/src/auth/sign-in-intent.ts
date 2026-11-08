import type { Locale } from "@zaafran/i18n/locales";
import { getSignInPurpose } from "./auth-flow";
import type { OtpPurpose } from "./auth-http";

export interface SignInDestination {
  readonly href:
    | `/${Locale}/merchant`
    | `/${Locale}/merchant/apply`
    | `/${Exclude<Locale, "ar">}/admin/merchant-applications`
    | `/${Exclude<Locale, "ar">}/admin/menu-items`;
  readonly label:
    "continueApplication" | "continueRestaurants" | "continueReview" | "continueModeration";
}

interface SignInIntent {
  readonly purpose: OtpPurpose;
  readonly subpath:
    | "/sign-in"
    | "/sign-in?purpose=admin"
    | "/sign-in?continue=merchant-apply"
    | "/sign-in?continue=merchant-status"
    | "/sign-in?continue=admin-review"
    | "/sign-in?continue=admin-moderation";
  readonly destination?: SignInDestination;
}

export function readSignInIntent(
  query: Readonly<Record<string, string | string[] | undefined>>,
  locale: Locale,
): SignInIntent {
  if (query.continue === "merchant-apply") {
    return {
      purpose: "sign_in",
      subpath: "/sign-in?continue=merchant-apply",
      destination: { href: `/${locale}/merchant/apply`, label: "continueApplication" },
    };
  }
  if (query.continue === "merchant-status") {
    return {
      purpose: "sign_in",
      subpath: "/sign-in?continue=merchant-status",
      destination: { href: `/${locale}/merchant`, label: "continueRestaurants" },
    };
  }
  if (query.continue === "admin-review" && locale !== "ar") {
    return {
      purpose: "admin_sign_in",
      subpath: "/sign-in?continue=admin-review",
      destination: { href: `/${locale}/admin/merchant-applications`, label: "continueReview" },
    };
  }
  if (query.continue === "admin-moderation" && locale !== "ar") {
    return {
      purpose: "admin_sign_in",
      subpath: "/sign-in?continue=admin-moderation",
      destination: { href: `/${locale}/admin/menu-items`, label: "continueModeration" },
    };
  }

  const purpose = getSignInPurpose(query.purpose);
  return { purpose, subpath: purpose === "admin_sign_in" ? "/sign-in?purpose=admin" : "/sign-in" };
}
