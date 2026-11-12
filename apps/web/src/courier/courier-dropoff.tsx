"use client";

import { localeDetails, type Locale } from "@zaafran/i18n/locales";
import { normalizeDigits } from "@zaafran/i18n/phone";
import { Button, Icon, TextField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CourierDeliveryAttempt, type useDeliveryAttempt } from "./courier-delivery-attempt";
import type { Job } from "./courier-http";
import { CourierLocation } from "./courier-location";
import { DeliveryProofForm } from "./delivery-proof-form";
import { SlideConfirm } from "./slide-confirm";
import { useDropoffCommand } from "./use-dropoff-command";

export function CourierDropoff({
  job,
  locale,
  offline,
  refresh,
  attempts,
}: {
  job: Job;
  locale: Locale;
  offline: boolean;
  refresh: () => void;
  attempts: ReturnType<typeof useDeliveryAttempt>;
}) {
  const t = useTranslations("courier");
  const [code, setCode] = useState("");
  const [proof, setProof] = useState(false);
  const { busy, error, submit } = useDropoffCommand(job, refresh);
  const locked = error === "lockedCode";
  const showProof = proof || locked;
  const disabled = busy || offline;

  return (
    <div className="courier-dropoff">
      <section className="courier-panel courier-confirm" aria-labelledby="courier-confirm-title">
        <h3 id="courier-confirm-title">
          <Icon name="check" />
          {t("dropoffConfirm")}
        </h3>
        {error && (
          <p className="courier-error" role="alert">
            {t(error)}
          </p>
        )}
        {showProof ? (
          <DeliveryProofForm
            orderId={job.order.orderId}
            disabled={disabled}
            onProof={(photo) => void submit({ kind: "deliver", proof: photo })}
          />
        ) : (
          <div className="courier-form">
            <TextField
              label={t("deliveryCode")}
              name="deliveryCode"
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              maxLength={4}
              value={code}
              onChange={(event) => {
                setCode(normalizeDigits(event.target.value).replace(/[^0-9]/gu, ""));
              }}
            />
            <SlideConfirm
              label={t("confirmDropoff")}
              hint={t(busy ? "saving" : "slideDropoff")}
              rtl={localeDetails[locale].direction === "rtl"}
              disabled={disabled || code.length !== 4}
              onConfirm={() => void submit({ kind: "deliver", proof: { kind: "code", code } })}
            />
          </div>
        )}
        {!locked && (
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setProof(!proof);
            }}
          >
            {t(showProof ? "useCode" : "usePhoto")}
          </Button>
        )}
      </section>
      <CourierLocation orderId={job.order.orderId} />
      <CourierDeliveryAttempt
        attempts={attempts}
        disabled={disabled}
        onFail={(reason) => void submit({ kind: "fail", reason })}
      />
    </div>
  );
}
