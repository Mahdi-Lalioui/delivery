import { requireOrderId } from "../../../../retention/retention-pages";
import { TrackingPage, trackingMetadata } from "../../../../tracking/tracking-page";

export const metadata = trackingMetadata("ar");

export default async function ArabicTracking({ params }: { params: Promise<{ orderId: string }> }) {
  return <TrackingPage orderId={await requireOrderId(params)} locale="ar" />;
}
