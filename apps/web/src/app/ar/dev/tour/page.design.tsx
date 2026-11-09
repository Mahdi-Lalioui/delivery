import { DemoTour } from "../../../../local-demo/tour";
import { notFound } from "next/navigation";

export default function ArabicTour() {
  if (process.env.NODE_ENV !== "development" || process.env.ZAAFRAN_LOCAL_DEMO !== "1") notFound();
  return <DemoTour locale="ar" />;
}
