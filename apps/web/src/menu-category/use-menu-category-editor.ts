"use client";

import { useEffect, useRef, useState } from "react";
import {
  makeCategoryDraft,
  moveMenuCategory,
  parseCategoryDraft,
  prepareCategoryAttempt,
  type CategoryCommand,
  type CategoryDraft,
  type CategoryFieldError,
} from "./category-editor";
import {
  listMenuCategories,
  saveMenuCategory,
  saveMenuCategoryOrder,
  type CategoryRead,
  type CategorySnapshot,
  type MenuCategory,
} from "./menu-category-http";

type CategoryView = CategoryRead | { kind: "loading" };
type CategoryNotice =
  | { kind: "created" | "updated" }
  | { kind: "moved"; categoryId: string; position: number; total: number };
type FocusRequest =
  { kind: "row"; categoryId: string } | { kind: "names" | "availability" | "reload" };
const saveErrorLabels = {
  error: "saveError",
  "rate-limited": "rateLimited",
  "category-limit": "categoryLimit",
} as const;
type SaveError = (typeof saveErrorLabels)[keyof typeof saveErrorLabels];
type Attempt = ReturnType<typeof prepareCategoryAttempt>;
type CategoryWriteResult = Awaited<ReturnType<typeof saveMenuCategory>>;
type CategoryOrderResult = Awaited<ReturnType<typeof saveMenuCategoryOrder>>;
type WriteFailure = Exclude<CategoryWriteResult, { kind: "ok" }>;
type CompletedWrite =
  | { kind: "saved"; data: Extract<CategoryWriteResult, { kind: "ok" }>["data"] }
  | { kind: "ordered"; data: Extract<CategoryOrderResult, { kind: "ok" }>["data"] };

async function executeCategoryCommand({
  merchantId,
  snapshot,
  attempt,
}: {
  merchantId: string;
  snapshot: CategorySnapshot;
  attempt: Attempt;
}): Promise<CompletedWrite | WriteFailure> {
  const { command, idempotencyKey } = attempt;
  const identity = { merchantId, sessionId: snapshot.sessionId, idempotencyKey };
  if (command.kind === "order") {
    const result = await saveMenuCategoryOrder({ ...identity, input: command.input });
    if (result.kind !== "ok") return result;

    const { categoryIds, revision } = result.data;
    const requested = command.input.categoryIds;
    if (
      categoryIds.length !== requested.length ||
      categoryIds.some((id, index) => id !== requested[index])
    ) {
      return { kind: "revision-conflict" };
    }
    return { kind: "ordered", data: { categoryIds, revision } };
  }

  const result = await saveMenuCategory({
    ...identity,
    ...(command.categoryId === undefined ? {} : { categoryId: command.categoryId }),
    input: command.input,
  });
  if (result.kind !== "ok") return result;
  if (command.categoryId !== undefined && result.data.category.categoryId !== command.categoryId) {
    return { kind: "revision-conflict" };
  }
  return { kind: "saved", data: result.data };
}

function applyOrder(
  categories: readonly MenuCategory[],
  orderedIds: readonly string[],
): MenuCategory[] {
  const byId = new Map(categories.map((category) => [category.categoryId, category]));
  return orderedIds.flatMap((categoryId, position) => {
    const category = byId.get(categoryId);
    return category ? [{ ...category, position }] : [];
  });
}

export function useMenuCategoryEditor(merchantId: string) {
  const [view, setView] = useState<CategoryView>({ kind: "loading" });
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState(() => makeCategoryDraft());
  const [selectedId, setSelectedId] = useState<string>();
  const [fieldError, setFieldError] = useState<CategoryFieldError>();
  const [saveError, setSaveError] = useState<SaveError>();
  const [isSaving, setSaving] = useState(false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [notice, setNotice] = useState<CategoryNotice>();
  const [focus, setFocus] = useState<FocusRequest>();
  const attempt = useRef<Attempt | undefined>(undefined);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void listMenuCategories({ merchantId, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, version]);

  function discardDraft() {
    setSelectedId(undefined);
    setDraft(makeCategoryDraft());
    setFieldError(undefined);
    setSaveError(undefined);
    setNotice(undefined);
    attempt.current = undefined;
  }

  function reload() {
    if (inFlight.current) return;
    discardDraft();
    setRevisionConflict(false);
    setFocus(undefined);
    setView({ kind: "loading" });
    setVersion((current) => current + 1);
  }

  function edit(category?: MenuCategory) {
    if (inFlight.current || revisionConflict) return;
    setSelectedId(category?.categoryId);
    setDraft(makeCategoryDraft(category));
    setFieldError(undefined);
    setSaveError(undefined);
    setFocus({ kind: "names" });
  }

  function update(field: keyof CategoryDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldError(undefined);
    setSaveError(undefined);
  }

  function handleFailure(result: WriteFailure) {
    if ("shouldReuseKey" in result) {
      if (!result.shouldReuseKey) attempt.current = undefined;
      setSaveError(saveErrorLabels[result.kind]);
      return;
    }

    attempt.current = undefined;
    if (result.kind === "revision-conflict") {
      setRevisionConflict(true);
      setFocus({ kind: "reload" });
      return;
    }

    discardDraft();
    setView({ kind: result.kind });
    setFocus(result.kind === "session-changed" ? { kind: "reload" } : undefined);
  }

  function recordSavedCategory(
    snapshot: CategorySnapshot,
    data: Extract<CompletedWrite, { kind: "saved" }>["data"],
  ) {
    const { category, revision } = data;
    const remaining = snapshot.categories.filter(
      ({ categoryId }) => categoryId !== category.categoryId,
    );
    const categories = [...remaining, category].sort(
      (left, right) => left.position - right.position,
    );
    setView({ kind: "ready", data: { ...snapshot, revision, categories } });
    setNotice({ kind: selectedId === undefined ? "created" : "updated" });
    setDraft(makeCategoryDraft(selectedId === undefined ? undefined : category));
    setFocus({ kind: "row", categoryId: category.categoryId });
  }

  async function run(command: CategoryCommand, movedId?: string) {
    if (view.kind !== "ready" || inFlight.current || revisionConflict) return;
    const snapshot = view.data;
    inFlight.current = true;
    setSaving(true);
    setSaveError(undefined);
    setNotice(undefined);

    attempt.current = prepareCategoryAttempt(command, attempt.current);
    const result = await executeCategoryCommand({ merchantId, snapshot, attempt: attempt.current });
    inFlight.current = false;
    setSaving(false);

    if (result.kind !== "saved" && result.kind !== "ordered") {
      handleFailure(result);
      return;
    }
    attempt.current = undefined;
    if (result.data.revision < snapshot.revision) {
      handleFailure({ kind: "revision-conflict" });
      return;
    }
    if (result.kind === "saved") {
      recordSavedCategory(snapshot, result.data);
      return;
    }

    const categories = applyOrder(snapshot.categories, result.data.categoryIds);
    setView({ kind: "ready", data: { ...snapshot, revision: result.data.revision, categories } });
    if (movedId !== undefined) {
      setFocus({ kind: "row", categoryId: movedId });
      setNotice({
        kind: "moved",
        categoryId: movedId,
        position: result.data.categoryIds.indexOf(movedId) + 1,
        total: categories.length,
      });
    }
  }

  async function save() {
    if (view.kind !== "ready") return;
    const result = parseCategoryDraft(draft, view.data.revision);
    if (result.kind === "invalid") {
      setFieldError(result.field);
      setFocus({ kind: result.field });
      return;
    }
    setFieldError(undefined);
    await run({
      kind: "category",
      ...(selectedId === undefined ? {} : { categoryId: selectedId }),
      input: result.input,
    });
  }

  async function move(sourceId: string, targetId: string) {
    if (view.kind !== "ready") return;
    const { categories, revision } = view.data;
    const categoryIds = moveMenuCategory(
      categories.map(({ categoryId }) => categoryId),
      sourceId,
      targetId,
    );
    if (categoryIds === undefined) return;

    await run({ kind: "order", input: { categoryIds, expectedRevision: revision } }, sourceId);
  }

  return {
    view,
    draft,
    selectedId,
    fieldError,
    saveError,
    isSaving,
    revisionConflict,
    notice,
    focus,
    edit,
    update,
    reload,
    save,
    move,
  };
}

export type MenuCategoryEditor = ReturnType<typeof useMenuCategoryEditor>;
