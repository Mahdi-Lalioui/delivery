import { listOptionGroups, type GroupSnapshot } from "../menu-option-group/option-group-http";

export const itemAttachmentLimit = 50;

export type ItemAttachmentAction = {
  kind: "attach" | "remove" | "earlier" | "later";
  groupId: string;
};

export type ItemAttachments =
  | { kind: "ready"; optionGroups: GroupSnapshot["optionGroups"] }
  | { kind: "loading" }
  | { kind: "error" | "revision-conflict" };

type AttachmentRead =
  | Exclude<ItemAttachments, { kind: "loading" }>
  | { kind: "sign-in" | "forbidden" | "session-changed" };

export async function loadItemAttachments({
  merchantId,
  signal,
  sessionId,
  revision,
}: {
  merchantId: string;
  signal: AbortSignal;
  sessionId: string;
  revision: number;
}): Promise<AttachmentRead> {
  const result = await listOptionGroups({ merchantId, signal });
  if (result.kind !== "ready") return { kind: result.kind };
  if (result.data.sessionId !== sessionId) return { kind: "session-changed" };
  if (result.data.revision !== revision) return { kind: "revision-conflict" };
  return { kind: "ready", optionGroups: result.data.optionGroups };
}

export function applyItemAttachmentAction(
  ids: string[],
  { kind, groupId }: ItemAttachmentAction,
): string[] {
  const index = ids.indexOf(groupId);
  if (kind === "attach") {
    return index === -1 && ids.length < itemAttachmentLimit ? [...ids, groupId] : ids;
  }
  if (index === -1) return ids;
  if (kind === "remove") return ids.filter((id) => id !== groupId);

  const otherIndex = index + (kind === "earlier" ? -1 : 1);
  const otherId = ids[otherIndex];
  if (otherId === undefined) return ids;
  const updated = [...ids];
  updated[index] = otherId;
  updated[otherIndex] = groupId;
  return updated;
}

export function isAttachmentSaveBlocked({ kind }: ItemAttachments): boolean {
  return kind === "loading" || kind === "revision-conflict";
}
