"use client";

import { adminOrderSearchInput } from "@zaafran/contracts/admin-orders";
import { normalizeAlgerianPhone } from "@zaafran/i18n/phone";
import { Button, FormGrid, SegmentedControl, SelectField, TextField } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { OrderQuery } from "./orders-http";

function filterFor(form: FormData) {
  const input = form.get("filter");
  if (typeof input !== "string" || !input.trim()) return undefined;
  switch (form.get("field")) {
    case "code":
      return { kind: "code", code: input.trim().toUpperCase() };
    case "phone":
      return { kind: "phone", phone: normalizeAlgerianPhone(input) };
    default:
      return { kind: "restaurant", name: input.trim() };
  }
}

export function OrderFilters({
  query,
  onChange,
}: {
  query: OrderQuery;
  onChange: (query: OrderQuery) => void;
}) {
  const t = useTranslations("adminOrders");
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="admin-orders-filters">
      <SegmentedControl
        legend={t("scope")}
        isLegendVisible={false}
        name="scope"
        options={[
          { value: "live", label: t("live") },
          { value: "all", label: t("all") },
        ]}
        value={query.scope}
        onChange={(scope) => {
          onChange(adminOrderSearchInput.parse({ scope, filter: query.filter }));
        }}
      />
      <form
        className="admin-orders-search"
        aria-label={t("search")}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const parsed = adminOrderSearchInput.safeParse({
            scope: query.scope,
            filter: filterFor(form),
          });
          setInvalid(!parsed.success);
          if (parsed.success) onChange(parsed.data);
        }}
      >
        <FormGrid>
          <SelectField label={t("searchBy")} name="field">
            <option value="code">{t("code")}</option>
            <option value="phone">{t("phone")}</option>
            <option value="restaurant">{t("restaurant")}</option>
          </SelectField>
          <TextField
            label={t("searchValue")}
            name="filter"
            type="search"
            dir="auto"
            maxLength={120}
            autoComplete="off"
            error={invalid ? t("invalidSearch") : undefined}
          />
        </FormGrid>
        <Button type="submit">{t("search")}</Button>
      </form>
    </div>
  );
}
