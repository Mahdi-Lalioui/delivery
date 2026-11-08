import type { ReactNode } from "react";
import { Document } from "../../components/document";
import { arabicFonts } from "../../fonts/arabic";

export default function ArabicLayout({ children }: { children: ReactNode }) {
  return (
    <Document locale="ar" fonts={arabicFonts}>
      {children}
    </Document>
  );
}
