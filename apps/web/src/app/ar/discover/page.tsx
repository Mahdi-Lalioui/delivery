import { CustomerData } from "../../../discovery/customer-data";
import { Home, homeMetadata } from "../../../components/home";

export const metadata = homeMetadata("ar", "/discover");

export default function ArabicDiscovery() {
  return (
    <CustomerData>
      <Home locale="ar" />
    </CustomerData>
  );
}
