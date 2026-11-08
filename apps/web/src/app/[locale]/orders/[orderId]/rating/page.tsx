import { requireLatinLocale } from "../../../../../i18n/latin-locale";
import {
  OrderRatingPage,
  ratingMetadata,
  requireOrderId,
} from "../../../../../retention/retention-pages";

interface Props {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams: Promise<{ fulfilment?: string | string[] }>;
}

export async function generateMetadata(props: Props) {
  return ratingMetadata(await requireLatinLocale(props), "title");
}

export default async function LatinOrderRating(props: Props) {
  const [orderId, locale, query] = await Promise.all([
    requireOrderId(props.params),
    requireLatinLocale(props),
    props.searchParams,
  ]);
  return (
    <OrderRatingPage orderId={orderId} locale={locale} isDelivery={query.fulfilment !== "pickup"} />
  );
}
