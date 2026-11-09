import { isPublicLocale } from "@zaafran/i18n/locales";
import { notFound } from "next/navigation";
import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";
import { isPreviewDemo } from "../../../preview-settings";
import { PreviewHub, previewMetadata } from "../../../preview/preview-hub";

export const metadata = previewMetadata;

export default async function LatinPreview(props: LatinPageProps) {
  if (!isPreviewDemo(process.env)) notFound();
  const locale = await requireLatinLocale(props);
  if (!isPublicLocale(locale)) notFound();
  return <PreviewHub locale={locale} />;
}
