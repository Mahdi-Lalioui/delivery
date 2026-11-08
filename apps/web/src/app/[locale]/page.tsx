import { requireLatinLocale, type LatinPageProps } from "../../i18n/latin-locale";
import { Landing, landingMetadata } from "../../marketing/landing";

export async function generateMetadata(props: LatinPageProps) {
  return landingMetadata(await requireLatinLocale(props));
}

export default async function LatinHome(props: LatinPageProps) {
  return <Landing locale={await requireLatinLocale(props)} />;
}
