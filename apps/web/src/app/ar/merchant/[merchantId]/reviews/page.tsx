import {
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";
import { MerchantReviewsPage, ratingMetadata } from "../../../../../retention/rating-pages";

export function generateMetadata() {
  return ratingMetadata("ar", "reviewsTitle");
}

export default async function ArabicMerchantReviews(props: MenuCategoryRouteProps) {
  return <MerchantReviewsPage merchantId={await requireMenuMerchantId(props)} locale="ar" />;
}
