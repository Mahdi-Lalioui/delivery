import { notFound } from "next/navigation";

const title = "جولة زعفران";

export default function ArabicTour() {
  if (process.env.NODE_ENV !== "development" || process.env.ZAAFRAN_LOCAL_DEMO !== "1") notFound();
  return (
    <main>
      <h1>{title}</h1>
    </main>
  );
}
