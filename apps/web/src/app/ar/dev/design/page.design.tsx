import { DesignGuide, designGuideMetadata } from "../../../../components/design-guide";

export function generateMetadata() {
  return designGuideMetadata("ar");
}

export default function ArabicDesignGuide() {
  return <DesignGuide locale="ar" />;
}
