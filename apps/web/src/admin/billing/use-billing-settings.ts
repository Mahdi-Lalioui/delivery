"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadBillingSettings,
  saveBillingSettings,
  settingsToDraft,
  type SettingsDraft,
  type SettingsLoad,
  type SettingsSave,
} from "./billing-settings-http";

export type BillingSettingsState = {
  view: SettingsLoad | { kind: "loading" };
  draft: SettingsDraft | undefined;
  outcome: SettingsSave | undefined;
  outcomeId: number;
  isSaving: boolean;
  change: (field: keyof SettingsDraft, value: string | boolean) => void;
  save: () => Promise<void>;
  refresh: () => void;
};

export function useBillingSettings(): BillingSettingsState {
  const [view, setView] = useState<BillingSettingsState["view"]>({ kind: "loading" });
  const [draft, setDraft] = useState<SettingsDraft>();
  const [outcome, setOutcomeValue] = useState<SettingsSave>();
  const [outcomeId, setOutcomeId] = useState(0);
  const setOutcome = useCallback((next: SettingsSave) => {
    setOutcomeValue(next);
    setOutcomeId((value) => value + 1);
  }, []);
  const [isSaving, setIsSaving] = useState(false);
  const [generation, setGeneration] = useState(0);
  // One key per unchanged draft, so a retried save is deduplicated by the server.
  const attempt = useRef<{ draft: SettingsDraft; key: string }>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void loadBillingSettings(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setView(result);
      if (result.kind === "ready") setDraft(settingsToDraft(result.settings));
    });
    return () => {
      controller.abort();
    };
  }, [generation]);

  const change = useCallback((field: keyof SettingsDraft, value: string | boolean) => {
    setDraft((current) => (current === undefined ? current : { ...current, [field]: value }));
  }, []);

  const refresh = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  const save = useCallback(async () => {
    if (draft === undefined || view.kind !== "ready") return;
    if (
      attempt.current === undefined ||
      JSON.stringify(attempt.current.draft) !== JSON.stringify(draft)
    ) {
      attempt.current = { draft, key: crypto.randomUUID() };
    }
    const { key } = attempt.current;
    setIsSaving(true);
    const result = await saveBillingSettings({ draft, expectedSessionId: view.sessionId, key });
    setIsSaving(false);
    setOutcome(result);
    if (result.kind === "saved") {
      attempt.current = undefined;
      setDraft(settingsToDraft(result.settings));
    }
  }, [draft, view, setOutcome]);

  return { view, draft, outcome, outcomeId, isSaving, change, save, refresh };
}
