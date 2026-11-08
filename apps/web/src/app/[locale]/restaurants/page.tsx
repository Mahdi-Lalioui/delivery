import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";
import { PitchPage, pitchMetadata } from "../../../marketing/pitch-page";

export async function generateMetadata(props: LatinPageProps) {
  return pitchMetadata(await requireLatinLocale(props));
}

export default async function LatinRestaurantPitch(props: LatinPageProps) {
  return <PitchPage locale={await requireLatinLocale(props)} />;
}
