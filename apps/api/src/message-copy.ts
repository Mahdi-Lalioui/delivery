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

export type InvitationKind = "staff" | "courier";
type InvitationCopyInput = {
  locale?: PublicLocale | undefined;
  publicOrigin: string;
  token: string;
  kind: InvitationKind;
};

export function invitationCopy({ locale = "fr", publicOrigin, token, kind }: InvitationCopyInput) {
  const url = new URL(`/${locale}/${kind === "staff" ? "staff/accept" : "courier"}`, publicOrigin);
  url.hash = new URLSearchParams({ [kind === "staff" ? "token" : "invite"]: token }).toString();
  const label = messages[locale].invitation;
  const subject = `AWID · ${label.replace(/\s*:$/u, "")}`;
  const text = `AWID · ${label} ${url.href}`;
  const html = `<p lang="${locale}" dir="auto"><a href="${url.href}">${subject}</a></p>`;
  return { subject, text, html };
}

export function messageLocale(language: string | undefined): PublicLocale {
  for (const entry of language?.split(",") ?? []) {
    const [tag] = entry.trim().toLowerCase().split(/[-;]/u);
    if (isPublicLocale(tag)) return tag;
  }
  return defaultLocale;
}
