import type { PublicLocale } from "@zaafran/i18n/locales";
import Link from "next/link";

const labels = { ar: "حاكِ الطلب", fr: "Simuler la commande", en: "Simulate the order" };

export function LocalSimulationLink({ locale }: { locale: PublicLocale }) {
  if (process.env.NODE_ENV !== "development" || process.env.ZAAFRAN_LOCAL_DEMO !== "1") return null;
  return (
    <Link className="ui-button ui-button-primary ui-button-md" href={`/${locale}/dev/simulation`}>
      {labels[locale]}
    </Link>
  );
}
