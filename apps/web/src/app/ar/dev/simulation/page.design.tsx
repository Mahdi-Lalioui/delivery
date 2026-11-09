import { notFound } from "next/navigation";
import { LocalSimulation } from "../../../../local-demo/simulation";

export default function ArabicSimulation() {
  if (process.env.NODE_ENV !== "development" || process.env.ZAAFRAN_LOCAL_DEMO !== "1") notFound();
  return <LocalSimulation locale="ar" />;
}
