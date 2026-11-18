import { MyOrdersPage, ordersMetadata } from "../../../retention/my-orders-page";

export function generateMetadata() {
  return ordersMetadata("ar");
}

export default function ArabicMyOrders() {
  return <MyOrdersPage locale="ar" />;
}
