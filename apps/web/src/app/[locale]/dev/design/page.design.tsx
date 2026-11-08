import { DesignGuide, designGuideMetadata } from "../../../../components/design-guide";
import { requireLatinLocale, type LatinPageProps } from "../../../../i18n/latin-locale";

export async function generateMetadata(props: LatinPageProps) {
  return designGuideMetadata(await requireLatinLocale(props));
}

export default async function LatinDesignGuide(props: LatinPageProps) {
  return <DesignGuide locale={await requireLatinLocale(props)} />;
}
