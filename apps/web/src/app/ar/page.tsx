import { Landing, landingMetadata } from "../../marketing/landing";

export function generateMetadata() {
  return landingMetadata("ar");
}

export default function ArabicHome() {
  return <Landing locale="ar" />;
}
