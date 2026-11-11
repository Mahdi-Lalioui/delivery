"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { Button, SelectField } from "@zaafran/ui";
import { listWilayas } from "../merchant-http";
import { useMerchantResource } from "../use-merchant-resource";
import "@zaafran/ui/ui.css";

type Props = {
  locale: Locale;
  value: number;
  label: string;
  errorText: string;
  loadingText: string;
  retryText: string;
  onChange: (value: number) => void;
};

export function WilayaField({
  locale,
  value,
  label,
  errorText,
  loadingText,
  retryText,
  onChange,
}: Props) {
  const { view, retry } = useMerchantResource(listWilayas);
  const options = view.kind === "ready" ? view.data : [];
  return (
    <div className="wilaya-field">
      <SelectField
        label={label}
        name="wilayaCode"
        value={String(value)}
        disabled={!options.length}
        aria-busy={view.kind === "loading"}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
      >
        {!options.length && (
          <option value={String(value)}>{view.kind === "loading" ? loadingText : label}</option>
        )}
        {options.map(({ code, nameAr, nameFr }) => (
          <option key={code} value={String(code)}>
            {locale === "ar" ? nameAr : nameFr}
          </option>
        ))}
      </SelectField>
      {!options.length && view.kind !== "loading" && (
        <div>
          <p role="alert">{errorText}</p>
          <Button variant="ghost" onClick={retry}>
            {retryText}
          </Button>
        </div>
      )}
    </div>
  );
}
