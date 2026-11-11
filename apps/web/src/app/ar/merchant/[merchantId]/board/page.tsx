import {
  requireMenuMerchantId,
  type MenuCategoryRouteProps,
} from "../../../../../menu-category/components/menu-category-page";
import { boardMetadata, MerchantBoardPage } from "../../../../../merchant-board/board-page";

export function generateMetadata() {
  return boardMetadata("ar");
}

export default async function ArabicMerchantBoard(props: MenuCategoryRouteProps) {
  return <MerchantBoardPage locale="ar" merchantId={await requireMenuMerchantId(props)} />;
}
