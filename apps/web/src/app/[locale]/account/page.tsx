import { AccountHub, accountHubMetadata } from "../../../account/account-hub";
import { requireLatinLocale, type LatinPageProps } from "../../../i18n/latin-locale";

export async function generateMetadata(props: LatinPageProps) {
  return accountHubMetadata(await requireLatinLocale(props));
}

export default async function LatinAccount(props: LatinPageProps) {
  return <AccountHub locale={await requireLatinLocale(props)} />;
}
