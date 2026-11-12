import { AdminOrdersPage, adminOrdersMetadata } from "../../../../admin/orders/admin-orders-page";

export function generateMetadata() {
  return adminOrdersMetadata("ar");
}

export default function ArabicAdminOrders() {
  return <AdminOrdersPage locale="ar" />;
}
