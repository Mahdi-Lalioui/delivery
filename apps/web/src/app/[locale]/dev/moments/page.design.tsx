import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";
import { MomentsPage, momentsMetadata } from "../../../../marketing/moments/moments-page";

export const metadata = momentsMetadata();

export default async function LatinMoments(props: LatinPageProps) {
  return <MomentsPage locale={await requireLatinLocale(props)} />;
}
