import { RealScreenPage } from "../../../../../design/real-screen-page";

export const metadata = { robots: { index: false, follow: false } };

export default async function ArabicRealScreen({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  return <RealScreenPage screen={(await params).screen} locale="ar" />;
}
