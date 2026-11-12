import { defaultLocale, isPublicLocale, type PublicLocale } from "@zaafran/i18n/locales";

const messages = {
  ar: { subject: "رمز التحقق من AWID", code: "رمز التحقق:", invitation: "دعوة:" },
  fr: { subject: "Votre code AWID", code: "Code :", invitation: "Invitation :" },
  en: { subject: "Your AWID code", code: "Your code:", invitation: "Invitation:" },
} satisfies Record<PublicLocale, { subject: string; code: string; invitation: string }>;

export function otpCopy(locale: PublicLocale = "fr", code: string) {
  const { subject, code: label } = messages[locale];
  const text = `AWID · ${label} ${code}`;
  const html = `<p lang="${locale}" dir="auto">AWID · ${label} <bdi>${code}</bdi></p>`;
  return { subject, text, html };
}

export function staffInvitationText({
  locale = "fr",
  publicOrigin,
  token,
}: {
  locale?: PublicLocale | undefined;
  publicOrigin: string;
  token: string;
}) {
  const url = new URL(`/${locale}/staff/accept`, publicOrigin);
  url.hash = new URLSearchParams({ token }).toString();
  return `AWID · ${messages[locale].invitation} ${url.href}`;
}

export function messageLocale(language: string | undefined): PublicLocale {
  for (const entry of language?.split(",") ?? []) {
    const [tag] = entry.trim().toLowerCase().split(/[-;]/u);
    if (isPublicLocale(tag)) return tag;
  }
  return defaultLocale;
}
