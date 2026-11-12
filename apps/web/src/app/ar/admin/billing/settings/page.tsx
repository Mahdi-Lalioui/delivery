import { AdminBillingSettingsPage, pageMetadata } from "../../../../../admin/billing-settings-page";
import "@zaafran/ui/ui.css";
import "../../../../../admin/billing/admin-billing.css";

export function generateMetadata() {
  return pageMetadata("ar");
}

export default function Page() {
  return <AdminBillingSettingsPage locale="ar" />;
}
