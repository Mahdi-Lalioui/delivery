import { Home, homeMetadata } from "../../components/home";
import { requireLatinLocale, type LatinPageProps } from "../../i18n/latin-locale";

export async function generateMetadata(props: LatinPageProps) {
  return homeMetadata(await requireLatinLocale(props));
}

export default async function LatinHome(props: LatinPageProps) {
  return <Home locale={await requireLatinLocale(props)} />;
}
