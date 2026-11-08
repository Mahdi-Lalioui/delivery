import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { connection } from "next/server";
import type { ReactNode } from "react";
import "../app/globals.css";

interface DocumentProps {
  children: ReactNode;
  locale: Locale;
  fonts: string;
}

export async function Document({ children, locale, fonts }: DocumentProps) {
  // Next.js attaches the request nonce to framework scripts during dynamic rendering.
  await connection();

  const { tag, direction } = localeDetails[locale];
  return (
    <html lang={tag} dir={direction} className={fonts}>
      <body>{children}</body>
    </html>
  );
}
