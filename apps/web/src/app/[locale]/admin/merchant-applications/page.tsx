import {
  AdminMerchantApplicationsPage,
  pageMetadata,
} from "../../../../admin/merchant-applications-page";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";
import { notFound } from "next/navigation";
import "../../../../admin/admin-merchant.css";

async function adminLocale(props: LatinPageProps) {
  const locale = await requireLatinLocale(props);
  if (locale === "fr" || locale === "en") return locale;
  notFound();
}

export async function generateMetadata(props: LatinPageProps) {
  return pageMetadata(await adminLocale(props));
}

export default async function Page(props: LatinPageProps) {
  return <AdminMerchantApplicationsPage locale={await adminLocale(props)} />;
}
