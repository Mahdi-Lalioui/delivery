import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import { requireMenuMerchantId } from "../../../../../menu-category/components/menu-category-page";
import { boardMetadata, MerchantBoardPage } from "../../../../../merchant-board/board-page";

type Props = { params: Promise<{ locale: string; merchantId: string }> };

export async function generateMetadata(props: Props) {
  return boardMetadata(await requireLatinLocale(props));
}

export default async function LatinMerchantBoard(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireMenuMerchantId(props),
    requireLatinLocale(props),
  ]);
  return <MerchantBoardPage locale={locale} merchantId={merchantId} />;
}
