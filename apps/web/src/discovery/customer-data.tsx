import { headers } from "next/headers";
import type { ReactNode } from "react";
import { LowDataProvider } from "./low-data";

export async function CustomerData({ children }: { children: ReactNode }) {
  const requested = (await headers()).get("save-data") === "on";
  return <LowDataProvider requested={requested}>{children}</LowDataProvider>;
}
