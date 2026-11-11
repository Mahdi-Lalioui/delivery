import { brand } from "@zaafran/config/brand";
import { isPublicLocale, localeDetails } from "@zaafran/i18n/locales";

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isPublicLocale(locale)) return new Response(null, { status: 404 });
  const name = locale === "ar" ? brand.arabicName : brand.name;
  return Response.json(
    {
      id: "/discover",
      name,
      short_name: name,
      lang: localeDetails[locale].tag,
      dir: localeDetails[locale].direction,
      start_url: `/${locale}/discover`,
      scope: "/",
      display: "standalone",
      background_color: "#FBF8F3",
      theme_color: "#FBF8F3",
      icons: [
        { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
