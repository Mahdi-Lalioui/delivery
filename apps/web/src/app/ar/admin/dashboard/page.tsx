import { AdminDashboardPage, pageMetadata } from "../../../../admin/dashboard-page";
import "@zaafran/ui/ui.css";
import "../../../../admin/billing/admin-billing.css";
import "../../../../retention/retention.css";

export function generateMetadata() {
  return pageMetadata("ar");
}

export default function Page() {
  return <AdminDashboardPage locale="ar" />;
}
