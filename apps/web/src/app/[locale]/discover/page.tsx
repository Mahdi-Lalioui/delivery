import { CustomerData } from "../../../discovery/customer-data";
import { Home, homeMetadata } from "../../../components/home";
import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";

export async function generateMetadata(props: LatinPageProps) {
  return homeMetadata(await requireLatinLocale(props), "/discover");
}

export default async function LatinDiscovery(props: LatinPageProps) {
  return (
    <CustomerData>
      <Home locale={await requireLatinLocale(props)} />
    </CustomerData>
  );
}
