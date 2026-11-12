import { verifiedIdentifiersOutput } from "@zaafran/contracts/auth";

export type VerifiedIdentifiers = ReturnType<typeof verifiedIdentifiersOutput.parse>;
export type IdentifierRead =
  { kind: "ready"; value: VerifiedIdentifiers } | { kind: "sign-in" | "error" };

export async function readIdentifiers(signal: AbortSignal): Promise<IdentifierRead> {
  try {
    const response = await fetch("/v1/me/identifiers", {
      signal,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    if (response.status === 401) return { kind: "sign-in" };
    if (!response.ok) return { kind: "error" };
    const result = verifiedIdentifiersOutput.safeParse(await response.json());
    return result.success ? { kind: "ready", value: result.data } : { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}
