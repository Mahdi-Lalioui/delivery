import { brand } from "@zaafran/config/brand";
import type { ReactNode } from "react";
import { Document } from "../../components/document";
import { arabicFonts } from "../../fonts/arabic";

// Every page gets a title; pages that name themselves read "Page · {brand}".
export const metadata = {
  title: { default: brand.arabicName, template: `%s · ${brand.arabicName}` },
};

export default function ArabicLayout({ children }: { children: ReactNode }) {
  return (
    <Document locale="ar" fonts={arabicFonts}>
      {children}
    </Document>
  );
}
