"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { readAdminApplicationNotice } from "./admin-merchant-http";
import type { AdminMerchantQueueState } from "./use-admin-merchant-queue";

type Notice = NonNullable<Awaited<ReturnType<typeof readAdminApplicationNotice>>>;

function usePendingApplications(sessionId: string | undefined, reviewed: boolean) {
  const [notice, setNotice] = useState<Notice>();
  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let fetching = false;

    async function poll(expectedSessionId: string) {
      if (fetching || document.visibilityState !== "visible") return;
      fetching = true;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
      const update = await readAdminApplicationNotice(expectedSessionId, signal);
      fetching = false;
      if (controller.signal.aborted) return;
      setNotice(update);
      timer = setTimeout(() => void poll(expectedSessionId), 5_000);
    }

    function onVisibility() {
      clearTimeout(timer);
      if (sessionId) void poll(sessionId);
    }

    document.addEventListener("visibilitychange", onVisibility);
    void poll(sessionId);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sessionId, reviewed]);

  return notice?.sessionId === sessionId ? notice : undefined;
}

export function PendingApplicationsNotice({ state }: { state: AdminMerchantQueueState }) {
  const t = useTranslations("adminMerchant");
  const sessionId = state.view.kind === "ready" ? state.view.sessionId : undefined;
  const notice = usePendingApplications(
    sessionId,
    state.notice === "approved" || state.notice === "rejected",
  );
  if (!notice?.pendingCount) return null;
  return (
    <div className="admin-merchant-pending">
      <p role="status">{t("pendingNotice", { count: notice.pendingCount })}</p>
      <button
        type="button"
        className="admin-merchant-button"
        disabled={state.isPaging || state.isSaving || state.application !== undefined}
        onClick={state.refresh}
      >
        {t("refreshPending")}
      </button>
    </div>
  );
}
