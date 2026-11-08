import { PrivacyPage, privacyMetadata } from "../../../../retention/retention-pages";

export function generateMetadata() {
  return privacyMetadata("ar");
}

export default function ArabicPrivacy() {
  return <PrivacyPage locale="ar" />;
}
