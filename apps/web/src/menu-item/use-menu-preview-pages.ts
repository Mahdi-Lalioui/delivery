import { useEffect, useState } from "react";
import {
  mergePreviewPages,
  readMenuPreviewPage,
  type PreviewFailure,
  type PreviewPage,
  type PreviewScope,
} from "./menu-preview-http";

export type OnPreviewFailure = (failure: Exclude<PreviewFailure, "error">) => void;

interface PreviewPagesOptions extends PreviewScope {
  categoryId: string;
  onFailure: OnPreviewFailure;
}

interface PageState {
  data: PreviewPage | null;
  pending: boolean;
  failed: boolean;
  focusItemId?: string;
}

const initialState: PageState = { data: null, pending: true, failed: false };

export function useMenuPreviewPages({
  merchantId,
  categoryId,
  expected: { sessionId, revision },
  onFailure,
}: PreviewPagesOptions) {
  const [state, setState] = useState<PageState>(initialState);
  const [request, setRequest] = useState<{ version: number; cursor?: string }>({ version: 0 });

  useEffect(() => {
    const controller = new AbortController();
    const cursor = request.cursor === undefined ? {} : { cursor: request.cursor };
    void readMenuPreviewPage({
      merchantId,
      categoryId,
      expected: { sessionId, revision },
      signal: controller.signal,
      ...cursor,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.kind === "error") {
        setState((previous) => ({ ...previous, failed: true, pending: false }));
      } else if (result.kind === "ready") {
        setState((previous) => mergePage(previous, result.data, request.cursor));
      } else {
        onFailure(result.kind);
      }
    });
    return () => {
      controller.abort();
    };
  }, [merchantId, categoryId, sessionId, revision, request, onFailure]);

  function loadMore() {
    if (state.pending) return;
    setState((previous) => ({ ...previous, pending: true, failed: false }));
    const cursor = state.data?.nextCursor;
    setRequest((previous) => ({
      version: previous.version + 1,
      ...(cursor ? { cursor } : {}),
    }));
  }

  return { ...state, loadMore };
}

function mergePage(previous: PageState, page: PreviewPage, cursor: string | undefined): PageState {
  const data = mergePreviewPages(cursor === undefined ? null : previous.data, page);
  if (!data) return { ...previous, pending: false, failed: true };
  const firstNewItem = cursor === undefined ? undefined : page.items[0];
  return {
    data,
    pending: false,
    failed: false,
    ...(firstNewItem ? { focusItemId: firstNewItem.itemId } : {}),
  };
}
