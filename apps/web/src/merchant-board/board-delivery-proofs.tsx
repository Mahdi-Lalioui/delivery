"use client";

import { Badge, Icon } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Board } from "./board-http";

type Proof = NonNullable<Board["deliveryProofs"]>[number];

function ProofItem({ proof }: { proof: Proof }) {
  const t = useTranslations("merchantBoard");
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <details
      className="board-disclosure"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <bdi>{proof.shortCode}</bdi>
        <Badge tone="warning">{t("photoProofFlag")}</Badge>
      </summary>
      {open && (
        <div className="board-form">
          <p>
            <bdi>{proof.reason}</bdi>
          </p>
          {failed ? (
            <p role="alert" className="board-error">
              {t("photoProofError")}
            </p>
          ) : (
            <img
              className="board-proof-photo"
              width={640}
              height={360}
              src={`/v1/media/${proof.photoId}/variants/webp/640`}
              alt={t("photoProofAlt")}
              onError={() => {
                setFailed(true);
              }}
            />
          )}
        </div>
      )}
    </details>
  );
}

export function BoardDeliveryProofs({ proofs }: { proofs: readonly Proof[] }) {
  const t = useTranslations("merchantBoard");
  if (!proofs.length) return null;
  return (
    <section className="board-auxiliary board-proof-list" aria-labelledby="board-proof-heading">
      <h2 id="board-proof-heading">
        <Icon name="flag" />
        {t("photoProofs")}
      </h2>
      {proofs.map((proof) => (
        <ProofItem key={proof.orderId} proof={proof} />
      ))}
    </section>
  );
}
