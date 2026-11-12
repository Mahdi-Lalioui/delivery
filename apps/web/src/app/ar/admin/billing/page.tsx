import { AdminBillingPage, pageMetadata } from "../../../../admin/billing-page";
import "@zaafran/ui/ui.css";
import "../../../../admin/billing/admin-billing.css";

export function generateMetadata() {
  return pageMetadata("ar");
}

export default function Page() {
  return <AdminBillingPage locale="ar" />;
}
