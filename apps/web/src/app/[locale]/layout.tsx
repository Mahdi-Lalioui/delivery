import type { ReactNode } from "react";
import { Document } from "../../components/document";
import { latinFonts } from "../../fonts/latin";
import { requireLatinLocale, type LatinPageProps } from "../../i18n/latin-locale";

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
