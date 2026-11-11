"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import type { Commune } from "../merchant-http";
import type { MerchantApplicationState } from "../use-merchant-application";
import type { useMerchantResource } from "../use-merchant-resource";

const cuisineOptions = [
  ["algerian", "cuisineAlgerian"],
  ["grill", "cuisineGrill"],
  ["pizza", "cuisinePizza"],
  ["seafood", "cuisineSeafood"],
  ["fried-chicken", "cuisineChicken"],
  ["sandwiches", "cuisineSandwiches"],
  ["pastry", "cuisinePastry"],
  ["healthy", "cuisineHealthy"],
] as const;

interface DraftFieldProps {
  state: MerchantApplicationState;
  field: "restaurantName" | "ownerName" | "rcNumber";
}

interface TextFieldOptions {
  error: "invalidName" | "invalidRc";
  maxLength: number;
  autoComplete?: string;
}

const textFields: Record<DraftFieldProps["field"], TextFieldOptions> = {
  restaurantName: { error: "invalidName", maxLength: 120, autoComplete: "organization" },
  ownerName: { error: "invalidName", maxLength: 120, autoComplete: "name" },
  rcNumber: { error: "invalidRc", maxLength: 64 },
};

export function ApplicationTextField({ state, field }: DraftFieldProps) {
  const translate = useTranslations("merchant");
  const fieldId = `merchant-${field}`;
  const options = textFields[field];
  const isInvalid = state.fields.includes(field);

  return (
    <div className="merchant-field">
      <label htmlFor={fieldId}>{translate(field)}</label>
      <input
        id={fieldId}
        name={field}
        value={state.draft[field]}
        type="text"
        dir="auto"
        autoComplete={options.autoComplete}
        maxLength={options.maxLength}
        aria-required={field !== "rcNumber"}
        aria-invalid={isInvalid}
        aria-describedby={isInvalid ? `${fieldId}-error` : undefined}
        onChange={(event) => {
          state.update({ [field]: event.currentTarget.value });
        }}
      />
      {isInvalid && (
        <p className="merchant-error" id={`${fieldId}-error`}>
          {translate(options.error)}
        </p>
      )}
    </div>
  );
}

interface CommuneFieldProps {
  state: MerchantApplicationState;
  locale: Locale;
  resource: ReturnType<typeof useMerchantResource<Commune[]>>;
  onPick: (communeId: string) => void;
}

function CommuneNotice({ resource }: { resource: CommuneFieldProps["resource"] }) {
  const translate = useTranslations("merchant");
  const { view } = resource;
  if (view.kind === "loading") return <p role="status">{translate("communesLoading")}</p>;
  if (view.kind === "ready") {
    return view.data.length === 0 ? <p role="status">{translate("communesEmpty")}</p> : null;
  }
  return (
    <div className="merchant-field">
      <p className="merchant-error" role="alert">
        {translate("communesError")}
      </p>
      <button type="button" className="merchant-secondary" onClick={resource.retry}>
        {translate("retry")}
      </button>
    </div>
  );
}

export function CommuneField({ state, locale, resource, onPick }: CommuneFieldProps) {
  const translate = useTranslations("merchant");
  const { view } = resource;
  const options = view.kind === "ready" ? view.data : [];
  const isInvalid = state.fields.includes("communeId") || state.error === "invalidCommune";

  return (
    <div className="merchant-field">
      <label htmlFor="merchant-commune">{translate("commune")}</label>
      <select
        id="merchant-commune"
        name="communeId"
        value={state.draft.communeId}
        disabled={options.length === 0}
        aria-required="true"
        aria-invalid={isInvalid}
        aria-describedby={isInvalid ? "merchant-commune-error" : undefined}
        onChange={(event) => {
          onPick(event.currentTarget.value);
        }}
      >
        <option value="">{translate("selectCommune")}</option>
        {options.map((commune) => (
          <option key={commune.id} value={commune.id}>
            {locale === "ar" ? commune.nameAr : commune.nameFr}
          </option>
        ))}
      </select>
      {isInvalid && (
        <p
          className="merchant-error"
          id="merchant-commune-error"
          role={state.error === "invalidCommune" ? "alert" : undefined}
        >
          {translate("invalidCommune")}
        </p>
      )}
      <CommuneNotice resource={resource} />
    </div>
  );
}

export function CuisineFields({ state }: { state: MerchantApplicationState }) {
  const translate = useTranslations("merchant");
  const isInvalid = state.fields.includes("cuisines");

  return (
    <fieldset
      className="merchant-group"
      aria-describedby={
        isInvalid ? "merchant-cuisines-hint merchant-cuisines-error" : "merchant-cuisines-hint"
      }
    >
      <legend>{translate("cuisines")}</legend>
      <p id="merchant-cuisines-hint" className="merchant-hint">
        {translate("cuisinesHint")}
      </p>
      <div className="merchant-cuisines">
        {cuisineOptions.map(([code, label]) => {
          const selected = state.draft.cuisines.includes(code);
          return (
            <label key={code}>
              <input
                type="checkbox"
                name="cuisines"
                checked={selected}
                value={code}
                disabled={!selected && state.draft.cuisines.length >= 5}
                onChange={() => {
                  const cuisines = selected
                    ? state.draft.cuisines.filter((item) => item !== code)
                    : [...state.draft.cuisines, code];
                  state.update({ cuisines });
                }}
              />
              {translate(label)}
            </label>
          );
        })}
      </div>
      {isInvalid && (
        <p className="merchant-error" id="merchant-cuisines-error">
          {translate("invalidCuisines")}
        </p>
      )}
    </fieldset>
  );
}
