import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";
import { PrivacyPage, privacyMetadata } from "../../../../retention/retention-pages";

export async function generateMetadata(props: LatinPageProps) {
  return privacyMetadata(await requireLatinLocale(props));
}

export default async function LatinPrivacy(props: LatinPageProps) {
  return <PrivacyPage locale={await requireLatinLocale(props)} />;
}
