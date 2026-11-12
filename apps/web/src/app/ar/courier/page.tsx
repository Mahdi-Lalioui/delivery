import { CourierPage, courierMetadata } from "../../../courier/courier-page";

export function generateMetadata() {
  return courierMetadata("ar");
}

export default function ArabicCourier() {
  return <CourierPage locale="ar" />;
}
