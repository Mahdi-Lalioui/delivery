"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CategoryRailAccessFailure } from "./item-category-rail";
import {
  applyItemAttachmentAction,
  isAttachmentSaveBlocked,
  loadItemAttachments,
  type ItemAttachmentAction,
  type ItemAttachments,
} from "./item-attachments";
import {
  buildInlinePriceCommand,
  makeMenuItemDraft,
  parseMenuItemDraft,
  prepareMenuItemAttempt,
  type ItemAttempt,
  type ItemDraft,
  type ItemField,
} from "./item-editor";
import {
  listMenuItems,
  refreshMenuItems,
  writeMenuItem,
  type ItemAvailability,
  type ItemRead,
  type ItemWrite,
  type MenuItem,
  type MenuItemCommand,
} from "./menu-item-http";

type View = ItemRead | { kind: "loading" };
type Editor = ({ kind: "create" } | { kind: "edit"; itemId: string }) & {
  draft: ItemDraft;
  invalid: ItemField | null;
};
type Notice =
  "created" | "updated" | "duplicated" | "archived" | "availabilitySaved" | "priceUpdated";
type InlinePrice = { itemId: string; value: string; invalid: boolean };
type Focus =
  | { kind: "heading" | "list" | "editor" }
  | { kind: "row" | "confirmation"; itemId: string }
  | { kind: "field"; field: ItemField }
  | { kind: "control"; id: string };

function commandControlId(command: MenuItemCommand, notice: Notice): string {
  if (notice === "priceUpdated" && command.kind === "edit") {
    return `menu-item-price-input-${command.itemId}`;
  }
  switch (command.kind) {
    case "create":
    case "edit":
      return "menu-item-save";
    default:
      return `menu-item-${command.kind}-${command.itemId}`;
  }
}

function savedFocus(
  result: Extract<ItemWrite, { data: unknown }>,
  items: MenuItem[],
  notice: Notice,
): Focus {
  if (result.kind === "archived") return { kind: "list" };
  const itemId = result.kind === "saved" ? result.data.item.itemId : result.data.itemId;
  if (!items.some((item) => item.itemId === itemId)) return { kind: "list" };
  return notice === "priceUpdated"
    ? { kind: "control", id: `menu-item-edit-price-${itemId}` }
    : { kind: "row", itemId };
}

export function useMenuItemEditor({
  merchantId,
  categoryId,
}: {
  merchantId: string;
  categoryId: string;
}) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [inlinePrice, setInlinePrice] = useState<InlinePrice | null>(null);
  const [attachments, setAttachments] = useState<ItemAttachments>({ kind: "loading" });
  const [attachmentVersion, setAttachmentVersion] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"saveError" | "rateLimited" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const attempt = useRef<ItemAttempt | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    void listMenuItems({ merchantId, categoryId, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, categoryId, loadVersion]);

  const resetPrivateState = useCallback(() => {
    setEditor(null);
    setInlinePrice(null);
    setAttachments({ kind: "loading" });
    setArchiveTarget(null);
    setError(null);
    setNotice(null);
    attempt.current = undefined;
  }, []);

  function retry() {
    resetPrivateState();
    setFocus({ kind: "heading" });
    setView({ kind: "loading" });
    setLoadVersion((previous) => previous + 1);
  }

  function openEditor(item?: MenuItem) {
    if (inlinePrice) return;
    setError(null);
    setArchiveTarget(null);
    setAttachments({ kind: "loading" });
    const fields = { draft: makeMenuItemDraft(item), invalid: null };
    setEditor(
      item ? { ...fields, kind: "edit", itemId: item.itemId } : { ...fields, kind: "create" },
    );
    setFocus({ kind: "editor" });
  }

  function closeEditor() {
    if (editor?.kind === "edit") setFocus({ kind: "row", itemId: editor.itemId });
    else setFocus({ kind: "list" });
    setEditor(null);
    setAttachments({ kind: "loading" });
    setError(null);
  }

  function changeDraft(changes: Partial<ItemDraft>) {
    setEditor((previous) =>
      previous ? { ...previous, invalid: null, draft: { ...previous.draft, ...changes } } : null,
    );
  }

  function submitDraft() {
    if (
      view.kind !== "ready" ||
      !editor ||
      inFlight.current ||
      isAttachmentSaveBlocked(attachments)
    ) {
      return;
    }
    const result = parseMenuItemDraft({
      draft: editor.draft,
      categoryId,
      expectedRevision: view.data.revision,
    });
    if (result.kind === "invalid") {
      setEditor({ ...editor, invalid: result.field });
      setFocus({ kind: "field", field: result.field });
      return;
    }
    const { input } = result;
    void (editor.kind === "edit"
      ? run({ kind: "edit", itemId: editor.itemId, input }, "updated")
      : run({ kind: "create", input }, "created"));
  }

  function openPrice(itemId: string) {
    if (view.kind !== "ready" || editor || archiveTarget || inlinePrice || inFlight.current) return;
    const item = view.data.items.find((entry) => entry.itemId === itemId);
    if (!item) return;

    setInlinePrice({ itemId, value: String(item.priceDzd), invalid: false });
    setError(null);
    setNotice(null);
    setFocus({ kind: "control", id: `menu-item-price-input-${itemId}` });
  }

  function changePrice(value: string) {
    setInlinePrice((previous) => (previous ? { ...previous, value, invalid: false } : null));
  }

  function cancelPrice() {
    if (!inlinePrice || inFlight.current) return;
    setInlinePrice(null);
    setError(null);
    setFocus({ kind: "control", id: `menu-item-edit-price-${inlinePrice.itemId}` });
  }

  function submitPrice() {
    if (view.kind !== "ready" || !inlinePrice || inFlight.current) return;
    const item = view.data.items.find((entry) => entry.itemId === inlinePrice.itemId);
    if (!item) return;

    const result = buildInlinePriceCommand({
      item,
      value: inlinePrice.value,
      expectedRevision: view.data.revision,
    });
    if (result.kind === "invalid") {
      setInlinePrice({ ...inlinePrice, invalid: true });
      setFocus({ kind: "control", id: `menu-item-price-input-${item.itemId}` });
    } else if (result.kind === "unchanged") {
      cancelPrice();
    } else {
      void run(result.command, "priceUpdated");
    }
  }

  function duplicate(itemId: string) {
    if (view.kind === "ready" && !inlinePrice) {
      void run(
        { kind: "duplicate", itemId, input: { expectedRevision: view.data.revision } },
        "duplicated",
      );
    }
  }

  function setAvailability(itemId: string, availability: ItemAvailability) {
    if (view.kind === "ready" && !inlinePrice) {
      void run(
        {
          kind: "availability",
          itemId,
          input: { expectedRevision: view.data.revision, availability },
        },
        "availabilitySaved",
      );
    }
  }

  function askArchive(itemId: string) {
    if (inlinePrice) return;
    setArchiveTarget(itemId);
    setError(null);
    setFocus({ kind: "confirmation", itemId });
  }

  function cancelArchive() {
    if (archiveTarget) setFocus({ kind: "row", itemId: archiveTarget });
    setArchiveTarget(null);
    setError(null);
  }

  function confirmArchive() {
    if (view.kind === "ready" && archiveTarget) {
      void run(
        { kind: "archive", itemId: archiveTarget, input: { expectedRevision: view.data.revision } },
        "archived",
      );
    }
  }

  const showUnavailable = useCallback(
    (result: Exclude<ItemRead, { kind: "ready" }>) => {
      resetPrivateState();
      setView(result);
      setFocus({ kind: "heading" });
    },
    [resetPrivateState],
  );

  const onRailAccessChanged = useCallback(
    (kind: CategoryRailAccessFailure) => {
      request.current?.abort();
      setPending(false);
      showUnavailable({ kind });
    },
    [showUnavailable],
  );

  const isEditing = editor !== null;
  const revision = view.kind === "ready" ? view.data.revision : undefined;
  const sessionId = view.kind === "ready" ? view.data.sessionId : undefined;

  useEffect(() => {
    if (!isEditing || sessionId === undefined || revision === undefined) return;
    const controller = new AbortController();
    void loadItemAttachments({ merchantId, sessionId, revision, signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return;
        if (
          result.kind === "sign-in" ||
          result.kind === "forbidden" ||
          result.kind === "session-changed"
        ) {
          showUnavailable({ kind: result.kind });
        } else {
          setAttachments(result.kind === "ready" ? result : { kind: result.kind });
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [isEditing, merchantId, sessionId, revision, attachmentVersion, showUnavailable]);

  function retryAttachments() {
    setAttachments({ kind: "loading" });
    setAttachmentVersion((previous) => previous + 1);
  }

  function updateAttachments(action: ItemAttachmentAction) {
    if (attachments.kind !== "ready" || !editor || inFlight.current) return;
    if (
      action.kind === "attach" &&
      !attachments.optionGroups.some((group) => group.optionGroupId === action.groupId)
    ) {
      return;
    }
    setEditor((previous) =>
      previous
        ? {
            ...previous,
            draft: {
              ...previous.draft,
              optionGroupIds: applyItemAttachmentAction(previous.draft.optionGroupIds, action),
            },
          }
        : null,
    );
  }

  async function finishWrite({
    command,
    result,
    signal,
    sessionId,
    successNotice,
  }: {
    command: MenuItemCommand;
    result: Extract<ItemWrite, { data: unknown }>;
    signal: AbortSignal;
    sessionId: string;
    successNotice: Notice;
  }) {
    const refreshed = await refreshMenuItems({
      merchantId,
      categoryId,
      signal,
      sessionId,
      minimumRevision: result.data.revision,
    });
    if (signal.aborted) return;
    if (refreshed.kind !== "ready") {
      showUnavailable(refreshed);
      return;
    }

    attempt.current = undefined;
    setView(refreshed);
    if (command.kind === "edit" || command.kind === "create") {
      setEditor(null);
      setInlinePrice(null);
      setAttachments({ kind: "loading" });
    }
    if (command.kind === "archive") setArchiveTarget(null);
    setNotice(successNotice);
    setFocus(savedFocus(result, refreshed.data.items, successNotice));
  }

  function retryWrite(
    result: Extract<ItemWrite, { shouldReuseKey: boolean }>,
    currentAttempt: ItemAttempt,
    controlId: string,
  ) {
    attempt.current = result.shouldReuseKey ? currentAttempt : undefined;
    setError(result.kind === "rate-limited" ? "rateLimited" : "saveError");
    setFocus({ kind: "control", id: controlId });
  }

  async function run(command: MenuItemCommand, successNotice: Notice) {
    const signal = request.current?.signal;
    if (!signal || view.kind !== "ready" || inFlight.current) return;

    inFlight.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    const sessionId = view.data.sessionId;

    try {
      const currentAttempt = prepareMenuItemAttempt(command, attempt.current);
      const result = await writeMenuItem({
        merchantId,
        sessionId,
        command,
        idempotencyKey: currentAttempt.idempotencyKey,
      });
      if (signal.aborted) return;

      if ("shouldReuseKey" in result) {
        retryWrite(result, currentAttempt, commandControlId(command, successNotice));
      } else if ("data" in result) {
        await finishWrite({ command, result, signal, sessionId, successNotice });
      } else {
        showUnavailable({ kind: result.kind });
      }
    } finally {
      inFlight.current = false;
      if (!signal.aborted) setPending(false);
    }
  }

  return {
    view,
    editor,
    inlinePrice,
    openPrice,
    changePrice,
    cancelPrice,
    submitPrice,
    attachments,
    retryAttachments,
    updateAttachments,
    archiveTarget,
    pending,
    error,
    notice,
    focus,
    retry,
    onRailAccessChanged,
    openEditor,
    closeEditor,
    changeDraft,
    submitDraft,
    duplicate,
    setAvailability,
    askArchive,
    cancelArchive,
    confirmArchive,
  };
}
