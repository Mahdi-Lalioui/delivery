import { AccountHub, accountHubMetadata } from "../../../account/account-hub";

export async function generateMetadata() {
  return accountHubMetadata("ar");
}

export default function ArabicAccount() {
  return <AccountHub locale="ar" />;
}
