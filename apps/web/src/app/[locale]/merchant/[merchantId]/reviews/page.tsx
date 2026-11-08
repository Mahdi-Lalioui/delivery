import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import { requireMenuMerchantId } from "../../../../../menu-category/components/menu-category-page";
import { MerchantReviewsPage, ratingMetadata } from "../../../../../retention/retention-pages";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return ratingMetadata(await requireLatinLocale(props), "reviewsTitle");
}

export default async function LatinMerchantReviews(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MerchantReviewsPage merchantId={merchantId} locale={locale} />;
}
