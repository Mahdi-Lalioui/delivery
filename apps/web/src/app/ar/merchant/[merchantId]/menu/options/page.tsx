import {
  OptionGroupPage,
  optionGroupMetadata,
  requireOptionGroupMerchant,
  type OptionGroupRouteProps,
} from "../../../../../../menu-option-group/components/option-group-page";

export function generateMetadata() {
  return optionGroupMetadata("ar");
}

export default async function ArabicOptionGroups(props: OptionGroupRouteProps) {
  return <OptionGroupPage merchantId={await requireOptionGroupMerchant(props)} locale="ar" />;
}
