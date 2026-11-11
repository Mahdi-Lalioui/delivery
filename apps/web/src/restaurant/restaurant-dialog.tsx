import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton } from "@zaafran/ui";
import type { Locale } from "@zaafran/i18n/locales";
import { getRestaurantMessages } from "./restaurant-messages";

export function RestaurantDialog({
  title,
  locale,
  onClose,
  children,
}: {
  title: string;
  locale: Locale;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className="restaurant-dialog" aria-labelledby={id} onClose={onClose}>
      <header className="restaurant-dialog-header">
        <h2 id={id}>
          <bdi>{title}</bdi>
        </h2>
        <IconButton
          icon="close"
          label={getRestaurantMessages(locale).close}
          onClick={() => {
            ref.current?.close();
          }}
        />
      </header>
      <div className="restaurant-dialog-body">{children}</div>
    </dialog>
  );
}
