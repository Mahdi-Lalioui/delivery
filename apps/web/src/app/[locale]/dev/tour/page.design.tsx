import { notFound } from "next/navigation";
import { requireLatinLocale } from "../../../../i18n/latin-locale";

const title = "Visite Zaafran";

export default async function LatinTour(props: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.ZAAFRAN_LOCAL_DEMO !== "1") notFound();
  const locale = await requireLatinLocale(props);
  if (locale !== "fr") notFound();
  return (
    <main>
      <h1>{title}</h1>
    </main>
  );
}
