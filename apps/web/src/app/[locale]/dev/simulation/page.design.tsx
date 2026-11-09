import { notFound } from "next/navigation";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";
import { LocalSimulation } from "../../../../local-demo/simulation";

export default async function FrenchSimulation(props: LatinPageProps) {
  if (process.env.NODE_ENV !== "development" || process.env.ZAAFRAN_LOCAL_DEMO !== "1") notFound();
  if ((await requireLatinLocale(props)) !== "fr") notFound();
  return <LocalSimulation locale="fr" />;
}
