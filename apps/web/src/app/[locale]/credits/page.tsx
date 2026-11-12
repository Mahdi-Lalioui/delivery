import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";
import { CreditsPage, creditsMetadata } from "../../../marketing/credits-page";

export async function generateMetadata(props: LatinPageProps) {
  return creditsMetadata(await requireLatinLocale(props));
}

export default async function LatinCredits(props: LatinPageProps) {
  return <CreditsPage locale={await requireLatinLocale(props)} />;
}
