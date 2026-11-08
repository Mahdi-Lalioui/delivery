import { PitchPage, pitchMetadata } from "../../../marketing/pitch-page";

export function generateMetadata() {
  return pitchMetadata("ar");
}

export default function ArabicRestaurantPitch() {
  return <PitchPage locale="ar" />;
}
