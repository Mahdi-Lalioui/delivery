import { AdminPlatformPage, pageMetadata } from "../../../../admin/platform-page";
import "@zaafran/ui/ui.css";
import "../../../../admin/billing/admin-billing.css";

export function generateMetadata() {
  return pageMetadata("ar");
}

export default function Page() {
  return <AdminPlatformPage locale="ar" />;
}
