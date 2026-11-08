import {
  OrderRatingPage,
  ratingMetadata,
  requireOrderId,
} from "../../../../../retention/rating-pages";

interface Props {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ fulfilment?: string | string[] }>;
}

export function generateMetadata() {
  return ratingMetadata("ar", "title");
}

export default async function ArabicOrderRating(props: Props) {
  const [orderId, query] = await Promise.all([requireOrderId(props.params), props.searchParams]);
  return (
    <OrderRatingPage orderId={orderId} locale="ar" isDelivery={query.fulfilment !== "pickup"} />
  );
}
