import { afterEach, expect, test, vi } from "vitest";
import { applyItemAttachmentAction, loadItemAttachments } from "../src/menu-item/item-attachments";

const merchantId = "019d6abc-1234-7234-8234-123456789000";
const sessionId = "019d6abc-1234-7234-8234-123456789001";
const otherSession = "019d6abc-1234-7234-8234-123456789002";
const firstId = "019d6abc-1234-7234-8234-123456789003";
const secondId = "019d6abc-1234-7234-8234-123456789004";
const thirdId = "019d6abc-1234-7234-8234-123456789005";
const group = { optionGroupId: thirdId, names: { fr: "Sauces" }, minimum: 0, maximum: 1 };
const revision = 12;
const signal = new AbortController().signal;
const snapshot = { merchantId, signal, sessionId, revision };

afterEach(() => vi.unstubAllGlobals());

test("[MER-10:attachments] reads option groups from the same merchant session and revision", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ optionGroups: [group], nextCursor: null, sessionId, revision }),
    );
  vi.stubGlobal("fetch", fetch);

  await expect(loadItemAttachments(snapshot)).resolves.toEqual({
    kind: "ready",
    optionGroups: [group],
  });
  expect(fetch).toHaveBeenCalledWith(`/v1/merchants/${merchantId}/menu/option-groups?limit=100`, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    method: "GET",
    signal,
  });
});

test.each([
  { override: { sessionId: otherSession, revision: revision + 1 }, kind: "session-changed" },
  { override: { revision: revision + 1 }, kind: "revision-conflict" },
  { override: { revision: revision - 1 }, kind: "revision-conflict" },
] as const)("[MER-10:attachments] discards library data on $kind", async ({ override, kind }) => {
  const page = { optionGroups: [group], nextCursor: null, sessionId, revision };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...page, ...override })));

  await expect(loadItemAttachments(snapshot)).resolves.toEqual({ kind });
});

test.each([
  [401, "sign-in"],
  [403, "forbidden"],
  [503, "error"],
] as const)(
  "[MER-10:attachments] exposes HTTP %i without replacement attachments",
  async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));

    await expect(loadItemAttachments(snapshot)).resolves.toEqual({ kind });
  },
);

test("[MER-10:attachments] appends a chosen group and reorders only the selected group", () => {
  const original = [secondId, firstId];
  const added = applyItemAttachmentAction(original, { kind: "attach", groupId: thirdId });
  const earlier = applyItemAttachmentAction(added, { kind: "earlier", groupId: thirdId });
  const later = applyItemAttachmentAction(earlier, { kind: "later", groupId: secondId });
  const removed = applyItemAttachmentAction(later, { kind: "remove", groupId: secondId });

  expect(original).toEqual([secondId, firstId]);
  expect(added).toEqual([secondId, firstId, thirdId]);
  expect(earlier).toEqual([secondId, thirdId, firstId]);
  expect(later).toEqual([thirdId, secondId, firstId]);
  expect(removed).toEqual([thirdId, firstId]);
});

test("[MER-10:attachments] refuses duplicate, over-limit and out-of-bounds edits", () => {
  const original = [secondId, firstId];
  const full = Array.from({ length: 50 }, () => crypto.randomUUID());

  expect(applyItemAttachmentAction(original, { kind: "attach", groupId: secondId })).toBe(original);
  expect(applyItemAttachmentAction(original, { kind: "remove", groupId: thirdId })).toBe(original);
  expect(applyItemAttachmentAction(original, { kind: "earlier", groupId: secondId })).toBe(
    original,
  );
  expect(applyItemAttachmentAction(original, { kind: "later", groupId: firstId })).toBe(original);
  expect(applyItemAttachmentAction(full, { kind: "attach", groupId: thirdId })).toBe(full);
});
