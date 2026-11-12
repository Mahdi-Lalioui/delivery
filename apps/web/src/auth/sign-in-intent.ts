import type { Locale } from "@zaafran/i18n/locales";
import { getSignInPurpose } from "./auth-flow";
import type { OtpPurpose } from "./auth-http";

export interface SignInDestination {
  readonly href:
    | `/${Locale}/merchant`
    | `/${Locale}/merchant/apply`
    | `/${Locale}/staff/accept`
    | `/${Locale}/courier`
    | `/${Locale}/admin/orders`
    | `/${Exclude<Locale, "ar">}/admin/merchant-applications`
    | `/${Exclude<Locale, "ar">}/admin/menu-items`;
  readonly label:
    | "continueApplication"
    | "continueRestaurants"
    | "continueInvitation"
    | "continueCourier"
    | "continueAdminOrders"
    | "continueReview"
    | "continueModeration";
}

interface SignInIntent {
  readonly purpose: OtpPurpose;
  readonly subpath:
    | "/sign-in"
    | "/sign-in?purpose=admin"
    | "/sign-in?continue=merchant-apply"
    | "/sign-in?continue=merchant-status"
    | "/sign-in?continue=staff-accept"
    | "/sign-in?continue=courier"
    | "/sign-in?continue=admin-orders"
    | "/sign-in?continue=admin-review"
    | "/sign-in?continue=admin-moderation";
  readonly destination?: SignInDestination;
}

function adminIntent(
  destination: string | string[] | undefined,
  locale: Locale,
): SignInIntent | undefined {
  if (destination === "admin-orders") {
    return {
      purpose: "admin_sign_in",
      subpath: "/sign-in?continue=admin-orders",
      destination: { href: `/${locale}/admin/orders`, label: "continueAdminOrders" },
    };
  }
  if (destination === "admin-review" && locale !== "ar") {
    return {
      purpose: "admin_sign_in",
      subpath: "/sign-in?continue=admin-review",
      destination: { href: `/${locale}/admin/merchant-applications`, label: "continueReview" },
    };
  }
  if (destination === "admin-moderation" && locale !== "ar") {
    return {
      purpose: "admin_sign_in",
      subpath: "/sign-in?continue=admin-moderation",
      destination: { href: `/${locale}/admin/menu-items`, label: "continueModeration" },
    };
  }
  return undefined;
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
  if (query.continue === "staff-accept") {
    return {
      purpose: "sign_in",
      subpath: "/sign-in?continue=staff-accept",
      destination: { href: `/${locale}/staff/accept`, label: "continueInvitation" },
    };
  }
  if (query.continue === "courier") {
    return {
      purpose: "sign_in",
      subpath: "/sign-in?continue=courier",
      destination: { href: `/${locale}/courier`, label: "continueCourier" },
    };
  }
  const admin = adminIntent(query.continue, locale);
  if (admin) return admin;

  const purpose = getSignInPurpose(query.purpose);
  return { purpose, subpath: purpose === "admin_sign_in" ? "/sign-in?purpose=admin" : "/sign-in" };
}
