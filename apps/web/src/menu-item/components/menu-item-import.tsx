"use client";

import type { Locale } from "@zaafran/i18n/locales";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MenuImportPanel } from "../../menu-import/components/menu-import-panel";
import { type MenuImportOptions, useMenuImport } from "../../menu-import/use-menu-import";

function ImportRegion({ locale, ...options }: MenuImportOptions & { locale: Locale }) {
  const controls = useMenuImport(options);
  return <MenuImportPanel locale={locale} controls={controls} />;
}

export function MenuItemImport(props: MenuImportOptions & { locale: Locale }) {
  const translate = useTranslations("menuItem");
  const [isOpen, setOpen] = useState(false);

  return (
    <>
      <div className="menu-item-actions">
        <button
          className="menu-item-secondary"
          type="button"
          aria-expanded={isOpen}
          aria-controls="menu-import-region"
          disabled={props.blocked && !isOpen}
          onClick={() => {
            setOpen((previous) => !previous);
          }}
        >
          {translate("importMenu")}
        </button>
      </div>
      <div id="menu-import-region">{isOpen && <ImportRegion {...props} />}</div>
    </>
  );
}
