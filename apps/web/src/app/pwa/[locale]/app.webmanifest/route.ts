import { brand } from "@zaafran/config/brand";
import { isPublicLocale, localeDetails } from "@zaafran/i18n/locales";

const shortcuts = {
  ar: { orders: "طلباتي", search: "بحث" },
  fr: { orders: "Mes commandes", search: "Recherche" },
  en: { orders: "My orders", search: "Search" },
} as const;

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
      description: brand.tagline[locale],
      background_color: "#FFFCF5",
      theme_color: "#0B3D2E",
      categories: ["food", "shopping"],
      icons: [
        { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: "/pwa/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
      shortcuts: [
        { name: shortcuts[locale].orders, url: `/${locale}/orders` },
        { name: shortcuts[locale].search, url: `/${locale}/discover?search=open` },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
