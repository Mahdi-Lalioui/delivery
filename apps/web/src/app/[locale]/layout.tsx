import { brand } from "@zaafran/config/brand";
import type { ReactNode } from "react";
import { Document } from "../../components/document";
import { latinFonts } from "../../fonts/latin";
import { requireLatinLocale, type LatinPageProps } from "../../i18n/latin-locale";

// Every page gets a title; pages that name themselves read "Page · {brand}".
export const metadata = { title: { default: brand.name, template: `%s · ${brand.name}` } };

export default async function LatinLayout({
  children,
  params,
}: LatinPageProps & { children: ReactNode }) {
  const locale = await requireLatinLocale({ params });
  return (
    <Document locale={locale} fonts={latinFonts}>
      {children}
    </Document>
  );
}
