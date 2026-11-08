import { requireLatinLocale } from "../../../../../../i18n/latin-locale";
import {
  OptionGroupPage,
  optionGroupMetadata,
  requireOptionGroupMerchant,
} from "../../../../../../menu-option-group/components/option-group-page";

interface Props {
  params: Promise<{ locale: string; merchantId: string }>;
}

export async function generateMetadata(props: Props) {
  return optionGroupMetadata(await requireLatinLocale(props));
}

export default async function LatinOptionGroups(props: Props) {
  const [merchantId, locale] = await Promise.all([
    requireOptionGroupMerchant(props),
    requireLatinLocale(props),
  ]);
  return <OptionGroupPage merchantId={merchantId} locale={locale} />;
}
