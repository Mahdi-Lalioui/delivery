import { notFound } from "next/navigation";
import AdminPage from "../../../../[locale]/admin/billing/settings/page";

export default function DemoArabicAdmin() {
  if (process.env.NODE_ENV !== "development" || process.env.ZAAFRAN_LOCAL_DEMO !== "1") notFound();
  return <AdminPage params={Promise.resolve({ locale: "ar" })} />;
}
