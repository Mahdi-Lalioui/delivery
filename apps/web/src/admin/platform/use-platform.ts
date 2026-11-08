"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadAudit,
  loadPlatform,
  saveFlag,
  saveSetting,
  type AuditEntity,
  type AuditPage,
  type GlobalFlag,
  type PlatformLoad,
  type PlatformWrite,
  type SettingKey,
} from "./platform-http";

type Banner = { ar: string; fr: string; en: string } | null;
type PlatformNotice = { id: number; result: PlatformWrite["kind"] };
export type PlatformState = {
  view: PlatformLoad | { kind: "loading" };
  audit: AuditPage | { kind: "loading" };
  entity: AuditEntity | undefined;
  notice: PlatformNotice | undefined;
  isSaving: boolean;
  filterAudit: (entity: AuditEntity | undefined) => void;
  setFlag: (key: GlobalFlag, isEnabled: boolean, reason: string) => Promise<boolean>;
  setSetting: (key: SettingKey, value: number | Banner, reason: string) => Promise<boolean>;
  refresh: () => void;
};

export function usePlatform(): PlatformState {
  const [view, setView] = useState<PlatformState["view"]>({ kind: "loading" });
  const [audit, setAudit] = useState<PlatformState["audit"]>({ kind: "loading" });
  const [entity, setEntity] = useState<AuditEntity>();
  const [notice, setNotice] = useState<PlatformNotice>();
  const [isSaving, setIsSaving] = useState(false);
  const [generation, setGeneration] = useState(0);
  // One idempotency key per identical write until it succeeds (safe retry after a lost response).
  const keys = useRef(new Map<string, string>());

  useEffect(() => {
    const controller = new AbortController();
    void loadPlatform(controller.signal).then((result) => {
      if (!controller.signal.aborted) setView(result);
    });
    return () => {
      controller.abort();
    };
  }, [generation]);

  useEffect(() => {
    const controller = new AbortController();
    setAudit({ kind: "loading" });
    void loadAudit({ entity, signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setAudit(result);
    });
    return () => {
      controller.abort();
    };
  }, [entity, generation]);

  const refresh = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  const write = useCallback(
    async (
      identity: string,
      send: (sessionId: string, idempotencyKey: string) => Promise<PlatformWrite>,
    ) => {
      if (view.kind !== "ready") return false;
      const idempotencyKey = keys.current.get(identity) ?? crypto.randomUUID();
      keys.current.set(identity, idempotencyKey);
      setIsSaving(true);
      const result = await send(view.sessionId, idempotencyKey);
      setIsSaving(false);
      setNotice({ id: Date.now(), result: result.kind });
      if (result.kind !== "saved") return false;
      keys.current.delete(identity);
      refresh();
      return true;
    },
    [refresh, view],
  );

  const setFlag = useCallback(
    (key: GlobalFlag, isEnabled: boolean, reason: string) =>
      write(JSON.stringify(["flag", key, isEnabled, reason]), (sessionId, idempotencyKey) =>
        saveFlag({ key, isEnabled, reason, sessionId, idempotencyKey }),
      ),
    [write],
  );

  const setSetting = useCallback(
    (key: SettingKey, value: number | Banner, reason: string) =>
      write(JSON.stringify(["setting", key, value, reason]), (sessionId, idempotencyKey) =>
        saveSetting({ key, value, reason, sessionId, idempotencyKey }),
      ),
    [write],
  );

  return {
    view,
    audit,
    entity,
    notice,
    isSaving,
    filterAudit: setEntity,
    setFlag,
    setSetting,
    refresh,
  };
}
