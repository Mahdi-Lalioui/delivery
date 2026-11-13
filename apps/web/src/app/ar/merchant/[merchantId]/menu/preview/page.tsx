import {
  MenuPreviewPage,
  menuPreviewMetadata,
  requirePreviewMerchantId,
  type MenuPreviewRouteProps,
} from "../../../../../../menu-preview/components/menu-preview-page";

export function generateMetadata() {
  return menuPreviewMetadata("ar");
}

export default async function ArabicMenuPreview(props: MenuPreviewRouteProps) {
  return <MenuPreviewPage merchantId={await requirePreviewMerchantId(props)} locale="ar" />;
}
