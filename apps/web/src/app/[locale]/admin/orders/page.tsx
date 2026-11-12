import { AdminOrdersPage, adminOrdersMetadata } from "../../../../admin/orders/admin-orders-page";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";

export async function generateMetadata(props: LatinPageProps) {
  return adminOrdersMetadata(await requireLatinLocale(props));
}

export default async function LatinAdminOrders(props: LatinPageProps) {
  return <AdminOrdersPage locale={await requireLatinLocale(props)} />;
}
