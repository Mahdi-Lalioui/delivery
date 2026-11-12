import {
  AdminMerchantApplicationsPage,
  pageMetadata,
} from "../../../../admin/merchant-applications-page";
import "../../../../admin/admin-merchant.css";

export function generateMetadata() {
  return pageMetadata("ar");
}

export default function Page() {
  return <AdminMerchantApplicationsPage locale="ar" />;
}
