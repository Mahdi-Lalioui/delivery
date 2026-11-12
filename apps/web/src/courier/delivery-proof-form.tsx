"use client";

import { Button, Skeleton, TextAreaField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { listDevices } from "../auth/device-sessions-http";
import { MediaPhotoField } from "../media-photo/media-photo-field";
import type { Proof } from "./courier-http";

type PhotoProof = Extract<Proof, { kind: "photo" }>;
type Props = { orderId: string; disabled: boolean; onProof: (proof: PhotoProof) => void };

function useProofSession() {
  const [session, setSession] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    void listDevices(controller.signal).then((result) => {
      if (!controller.signal.aborted)
        setSession(
          result.kind === "ready"
            ? (result.sessions.find(({ current }) => current)?.id ?? null)
            : null,
        );
    });
    return () => {
      controller.abort();
    };
  }, []);
  return session;
}

export function DeliveryProofForm({ orderId, disabled, onProof }: Props) {
  const t = useTranslations("courier");
  const session = useProofSession();
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [uploading, setUploading] = useState(false);
  if (session === undefined) return <Skeleton label={t("loading")} />;
  if (session === null)
    return (
      <p className="courier-error" role="alert">
        {t("proofSignIn")}
      </p>
    );

  return (
    <form
      className="courier-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (photoId && reason.trim()) onProof({ kind: "photo", photoId, reason: reason.trim() });
      }}
    >
      <MediaPhotoField
        kind="delivery_proof"
        orderId={orderId}
        expectedSessionId={session}
        mediaId={photoId}
        onChange={setPhotoId}
        onBusyChange={setUploading}
        disabled={disabled}
        title={t("proofPhoto")}
        description={t("proofPhotoHint")}
      />
      <TextAreaField
        label={t("reason")}
        name="proofReason"
        maxLength={500}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
      <Button
        variant="primary"
        type="submit"
        disabled={disabled || uploading || !photoId || !reason.trim()}
      >
        {t("submitProof")}
      </Button>
    </form>
  );
}
