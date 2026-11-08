import { MyOrdersPage, ordersMetadata } from "../../../retention/retention-pages";

export function generateMetadata() {
  return ordersMetadata("ar");
}

export default function ArabicMyOrders() {
  return <MyOrdersPage locale="ar" />;
}
