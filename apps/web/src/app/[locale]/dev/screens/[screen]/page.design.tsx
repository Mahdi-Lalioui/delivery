import { RealScreenPage } from "../../../../../design/real-screen-page";
import { requireLatinLocale } from "../../../../../i18n/latin-locale";

export const metadata = { robots: { index: false, follow: false } };

export default async function LatinRealScreen(props: {
  params: Promise<{ locale: string; screen: string }>;
}) {
  const [locale, { screen }] = await Promise.all([requireLatinLocale(props), props.params]);
  return <RealScreenPage screen={screen} locale={locale} />;
}
