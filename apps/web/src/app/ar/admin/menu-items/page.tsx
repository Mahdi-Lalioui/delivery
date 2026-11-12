import { AdminHeldMenuItemsPage, pageMetadata } from "../../../../admin/menu-items-page";
import "../../../../admin/admin-merchant.css";

export function generateMetadata() {
  return pageMetadata("ar");
}

export default function Page() {
  return <AdminHeldMenuItemsPage locale="ar" />;
}
