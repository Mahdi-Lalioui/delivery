import { requireLatinLocale } from "../../../../../../i18n/latin-locale";
import {
  MenuPreviewPage,
  menuPreviewMetadata,
  requirePreviewMerchantId,
} from "../../../../../../menu-preview/components/menu-preview-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return menuPreviewMetadata(await requireLatinLocale(props));
}

export default async function LatinMenuPreview(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requirePreviewMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MenuPreviewPage merchantId={merchantId} locale={locale} />;
}
