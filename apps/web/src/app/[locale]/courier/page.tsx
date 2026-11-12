import { CourierPage, courierMetadata } from "../../../courier/courier-page";
import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";

export async function generateMetadata(props: LatinPageProps) {
  return courierMetadata(await requireLatinLocale(props));
}

export default async function LatinCourier(props: LatinPageProps) {
  return <CourierPage locale={await requireLatinLocale(props)} />;
}
