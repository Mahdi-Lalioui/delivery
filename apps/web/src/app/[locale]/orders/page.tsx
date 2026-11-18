import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";
import { MyOrdersPage, ordersMetadata } from "../../../retention/my-orders-page";

export async function generateMetadata(props: LatinPageProps) {
  return ordersMetadata(await requireLatinLocale(props));
}

export default async function LatinMyOrders(props: LatinPageProps) {
  return <MyOrdersPage locale={await requireLatinLocale(props)} />;
}
