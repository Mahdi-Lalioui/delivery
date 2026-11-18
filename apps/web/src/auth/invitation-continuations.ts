type Kind = "staff" | "courier";

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

export async function stageInvitation(kind: Kind, token: string): Promise<boolean> {
  try {
    const response = await fetch(`/v1/invitation-continuations/${kind}`, {
      ...requestOptions,
      signal: AbortSignal.timeout(12_000),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return response.status === 204;
  } catch {
    return false;
  }
}

export async function readPendingInvitation(kind: Kind): Promise<boolean> {
  const response = await fetch(`/v1/invitation-continuations/${kind}`, {
    ...requestOptions,
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error("Failed to check for an invitation.");
  const status: unknown = await response.json();
  if (
    typeof status !== "object" ||
    status === null ||
    !("pending" in status) ||
    typeof status.pending !== "boolean"
  ) {
    throw new Error("Invalid invitation status.");
  }
  return status.pending;
}

export function clearInvitationFragment(fragment: string) {
  if (fragment && window.location.hash === fragment) {
    history.replaceState(history.state, "", window.location.pathname + window.location.search);
  }
}
