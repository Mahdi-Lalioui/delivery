import { requireLatinLocale } from "../../../../i18n/latin-locale";
import { requireOrderId } from "../../../../retention/retention-pages";
import { TrackingPage, trackingMetadata } from "../../../../tracking/tracking-page";

interface Props {
  params: Promise<{ locale: string; orderId: string }>;
}

export async function generateMetadata(props: Props) {
  return trackingMetadata(await requireLatinLocale(props));
}

export default async function LatinTracking(props: Props) {
  const [orderId, locale] = await Promise.all([
    requireOrderId(props.params),
    requireLatinLocale(props),
  ]);
  return <TrackingPage orderId={orderId} locale={locale} />;
}
