import { brand } from "@zaafran/config/brand";
import { isPublicLocale, localeDetails } from "@zaafran/i18n/locales";

const messages = {
  ar: {
    title: "أنت غير متصل بالإنترنت",
    detail: "اتصل بالإنترنت مجددًا لعرض المطاعم والقوائم الحالية.",
    retry: "إعادة المحاولة",
  },
  fr: {
    title: "Vous êtes hors ligne",
    detail: "Reconnectez-vous pour retrouver les restaurants et leurs menus à jour.",
    retry: "Réessayer",
  },
  en: {
    title: "You’re offline",
    detail: "Reconnect to see restaurants and their current menus.",
    retry: "Try again",
  },
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) return new Response(null, { status: 404 });
  const { tag, direction } = localeDetails[locale];
  const { title, detail, retry } = messages[locale];
  const name = locale === "ar" ? brand.arabicName : brand.name;
  return new Response(
    `<!doctype html>
<html lang="${tag}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${title} · ${name}</title>
    <link rel="stylesheet" href="/pwa/offline.css">
  </head>
  <body>
    <main>
      <p class="brand"><span aria-hidden="true"></span>${name}</p>
      <h1>${title}</h1>
      <p>${detail}</p>
      <a href="/${locale}/discover">${retry}</a>
    </main>
  </body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
