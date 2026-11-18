import { staffInvitationAcceptInput } from "@zaafran/contracts/merchant-staff";

/** MER-23: the SMS link carries the token in the fragment, so it never reaches a server log. */
export function readInvitationToken(hash: string): string | undefined {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  const result = staffInvitationAcceptInput.safeParse({ token });
  return result.success ? result.data.token : undefined;
}
