"use client";

import { useEffect, useRef, useState } from "react";
import {
  createGroupDraft,
  createOptionDraft,
  moveOption,
  parseGroupDraft,
  prepareGroupAttempt,
  type GroupAttempt,
  type GroupDraft,
  type GroupError,
  type OptionDraft,
} from "./option-group-editor";
import {
  listOptionGroups,
  readOptionGroup,
  refreshOptionGroups,
  saveOptionGroup,
  type LibraryRead,
  type LibraryWrite,
  type OptionGroupCommand,
} from "./option-group-http";

type View = LibraryRead | { kind: "loading" };
type Editor = { optionGroupId?: string; draft: GroupDraft; invalid: GroupError | null };
type Notice =
  { kind: "created" | "updated" } | { kind: "movedOption" | "removedOption"; position: number };
type ErrorKey = "saveError" | "rateLimited";

function invalidFocus(error: GroupError): string {
  switch (error.field) {
    case "name":
      return "option-group-name-ar";
    case "limits":
      return "option-group-minimum";
    case "options":
      return "option-group-options";
    case "optionName":
      return `option-group-${error.optionKey}-ar`;
    case "optionPrice":
      return `option-group-${error.optionKey}-price`;
  }
}

export function useOptionGroupEditor(merchantId: string) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState<"detail" | "save" | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [focus, setFocus] = useState<{ id: string } | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const attempt = useRef<GroupAttempt | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    void listOptionGroups({ merchantId, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, loadVersion]);

  function showBlocked(next: View) {
    setView(next);
    setEditor(null);
    setError(null);
    setNotice(null);
    attempt.current = undefined;
    setFocus({ id: "option-group-title" });
  }

  function retry() {
    showBlocked({ kind: "loading" });
    setLoadVersion((previous) => previous + 1);
  }

  function create() {
    setEditor({ draft: createGroupDraft(), invalid: null });
    setError(null);
    setNotice(null);
    setFocus({ id: "option-group-editor-title" });
  }

  async function edit(optionGroupId: string) {
    const signal = request.current?.signal;
    if (!signal || view.kind !== "ready" || busy.current) return;

    busy.current = true;
    setPending("detail");
    setError(null);
    setNotice(null);
    const { sessionId, revision } = view.data;
    try {
      const result = await readOptionGroup({
        merchantId,
        optionGroupId,
        signal,
        sessionId,
        revision,
      });
      if (signal.aborted) return;
      if (result.kind !== "ready") {
        showBlocked(result);
        return;
      }
      setEditor({ optionGroupId, draft: createGroupDraft(result.data), invalid: null });
      setFocus({ id: "option-group-editor-title" });
    } finally {
      busy.current = false;
      if (!signal.aborted) setPending(null);
    }
  }

  function cancel() {
    setFocus({
      id: editor?.optionGroupId ? `option-group-edit-${editor.optionGroupId}` : "option-group-new",
    });
    setEditor(null);
    setError(null);
    setNotice(null);
  }

  function changeDraft(changes: Partial<GroupDraft>) {
    setEditor((previous) =>
      previous ? { ...previous, draft: { ...previous.draft, ...changes }, invalid: null } : null,
    );
  }

  function changeOption(key: string, changes: Partial<Omit<OptionDraft, "key" | "optionId">>) {
    if (!editor) return;
    const options = editor.draft.options.map((option) =>
      option.key === key ? { ...option, ...changes } : option,
    );
    changeDraft({ options });
  }

  function addOption() {
    if (!editor || editor.draft.options.length >= 100) return;
    const option = createOptionDraft();
    changeDraft({ options: [...editor.draft.options, option] });
    setNotice(null);
    setFocus({ id: `option-group-${option.key}-ar` });
  }

  function removeOption(index: number) {
    if (!editor || editor.draft.options.length <= 1) return;
    const options = editor.draft.options.filter((_, position) => position !== index);
    const next = options[Math.min(index, options.length - 1)];
    changeDraft({ options });
    setNotice({ kind: "removedOption", position: index + 1 });
    setFocus({ id: next ? `option-group-${next.key}-heading` : "option-group-add" });
  }

  function reorderOption(index: number, delta: -1 | 1) {
    if (!editor) return;
    const options = moveOption(editor.draft.options, index, delta);
    if (options === editor.draft.options) return;

    const position = index + delta;
    const option = options[position];
    if (!option) return;

    changeDraft({ options });
    setNotice({ kind: "movedOption", position: position + 1 });
    const canContinue = position + delta >= 0 && position + delta < options.length;
    const control = delta === -1 ? "earlier" : "later";
    setFocus({ id: `option-group-${option.key}-${canContinue ? control : "heading"}` });
  }

  async function finishSave({
    result,
    sessionId,
    signal,
    command,
  }: {
    result: Extract<LibraryWrite, { kind: "saved" }>;
    sessionId: string;
    signal: AbortSignal;
    command: OptionGroupCommand;
  }) {
    const next = await refreshOptionGroups({
      merchantId,
      signal,
      sessionId,
      minimumRevision: result.data.revision,
    });
    if (signal.aborted) return;
    if (next.kind !== "ready") {
      showBlocked(next);
      return;
    }

    attempt.current = undefined;
    setView(next);
    setEditor(null);
    setNotice({ kind: command.kind === "create" ? "created" : "updated" });
    const savedId = result.data.optionGroup.optionGroupId;
    const saved = next.data.optionGroups.some((group) => group.optionGroupId === savedId);
    setFocus({ id: saved ? `option-group-row-${savedId}` : "option-group-list-title" });
  }

  function retrySave(
    result: Extract<LibraryWrite, { shouldReuseKey: boolean }>,
    currentAttempt: GroupAttempt,
  ) {
    attempt.current = result.shouldReuseKey ? currentAttempt : undefined;
    setError(result.kind === "rate-limited" ? "rateLimited" : "saveError");
    setFocus({ id: "option-group-save" });
  }

  async function runSave(command: OptionGroupCommand) {
    const signal = request.current?.signal;
    if (!signal || view.kind !== "ready" || busy.current) return;
    const { sessionId } = view.data;
    busy.current = true;
    setPending("save");
    setError(null);
    setNotice(null);

    try {
      const currentAttempt = prepareGroupAttempt(command, attempt.current);
      const result = await saveOptionGroup({
        merchantId,
        sessionId,
        idempotencyKey: currentAttempt.idempotencyKey,
        command,
      });
      if (signal.aborted) return;
      if (result.kind === "saved") {
        await finishSave({ result, sessionId, signal, command });
      } else if ("shouldReuseKey" in result) {
        retrySave(result, currentAttempt);
      } else {
        showBlocked(result);
      }
    } finally {
      busy.current = false;
      if (!signal.aborted) setPending(null);
    }
  }

  function submit() {
    if (view.kind !== "ready" || !editor || busy.current) return;
    const { optionGroupId, draft } = editor;
    const result = parseGroupDraft({
      draft,
      expectedRevision: view.data.revision,
      ...(optionGroupId === undefined ? {} : { optionGroupId }),
    });
    if (result.kind === "invalid") {
      setEditor({ ...editor, invalid: result });
      setFocus({ id: invalidFocus(result) });
    } else {
      void runSave(result.command);
    }
  }

  return {
    view,
    editor,
    pending,
    error,
    notice,
    focusId: focus,
    retry,
    create,
    edit,
    cancel,
    changeDraft,
    changeOption,
    addOption,
    removeOption,
    reorderOption,
    submit,
  };
}
