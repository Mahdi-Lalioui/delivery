import { CreditsPage, creditsMetadata } from "../../../marketing/credits-page";

export async function generateMetadata() {
  return creditsMetadata("ar");
}

export default function ArabicCredits() {
  return <CreditsPage locale="ar" />;
}
