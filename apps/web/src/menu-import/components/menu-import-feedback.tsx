import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { MenuImportPreview } from "../import-http";
import type { MenuImportControls } from "../use-menu-import";

const failureMessages = {
  "session-changed": "failureSessionChanged",
  "revision-conflict": "failureRevisionConflict",
  "invalid-preview": "failureInvalidPreview",
  "import-conflict": "failureImportConflict",
  "idempotency-conflict": "failureIdempotencyConflict",
  "invalid-rows": "failureInvalidRows",
  "too-large": "failureTooLarge",
  "sign-in": "failureSignIn",
  forbidden: "failureForbidden",
  error: "failureError",
  "rate-limited": "failureRateLimited",
} as const;

function ImportStatus({ controls }: { controls: MenuImportControls }) {
  const translate = useTranslations("menuImport");
  const { state, pending } = controls;
  switch (state.kind) {
    case "applied":
      return <p role="status">{translate("applied")}</p>;
    case "applying":
      return <p role="status">{translate("applying")}</p>;
    case "previewing":
      return <p role="status">{translate("previewing")}</p>;
    case "editing":
      return pending && controls.fileName ? <p role="status">{translate("parsing")}</p> : null;
    default:
      return null;
  }
}

export function ImportFeedback({
  controls,
  preview,
}: {
  controls: MenuImportControls;
  preview: MenuImportPreview | undefined;
}) {
  const translate = useTranslations("menuImport");
  const feedback = useRef<HTMLDivElement>(null);
  const { state, fileError } = controls;
  const failure = "failure" in state ? state.failure : undefined;
  const hasErrors = Boolean(preview?.errors.length);
  const shouldFocus = Boolean(fileError || failure || hasErrors || state.kind === "applied");

  useEffect(() => {
    if (shouldFocus) feedback.current?.focus();
  }, [shouldFocus, fileError, failure, hasErrors]);

  return (
    <div id="menu-import-feedback" ref={feedback} tabIndex={-1}>
      {fileError && (
        <p className="menu-item-error" id="menu-import-file-error" role="alert">
          {translate(`fileErrors.${fileError}`)}
        </p>
      )}
      {failure && (
        <p className="menu-item-error" role="alert">
          {translate(failureMessages[failure])}
        </p>
      )}
      {hasErrors && (
        <p className="menu-item-error" role="alert">
          {translate("errorsCaption")}
        </p>
      )}
      <ImportStatus controls={controls} />
    </div>
  );
}
