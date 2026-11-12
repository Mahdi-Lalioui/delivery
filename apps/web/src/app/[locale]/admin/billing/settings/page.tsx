import { AdminBillingSettingsPage, pageMetadata } from "../../../../../admin/billing-settings-page";
import { requireLatinLocale, type LatinPageProps } from "../../../../../i18n/latin-locale";
import { notFound } from "next/navigation";
import "@zaafran/ui/ui.css";
import "../../../../../admin/billing/admin-billing.css";

async function adminLocale(props: LatinPageProps) {
  const locale = await requireLatinLocale(props);
  if (locale === "fr" || locale === "en") return locale;
  notFound();
}

export async function generateMetadata(props: LatinPageProps) {
  return pageMetadata(await adminLocale(props));
}

export default async function Page(props: LatinPageProps) {
  return <AdminBillingSettingsPage locale={await adminLocale(props)} />;
}
