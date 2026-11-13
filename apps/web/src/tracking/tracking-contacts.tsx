"use client";

import { Icon } from "@zaafran/ui";
import { useTranslations } from "next-intl";
import type { Tracking } from "./tracking-http";

/** The courier (while one is assigned) and the restaurant, each one tap away. */
export function Contacts({ tracking }: { tracking: Tracking }) {
  const translate = useTranslations("tracking");
  const courier = tracking.fulfilment === "delivery" ? tracking.courier : null;
  return (
    <div className="tracking-contacts">
      {courier && (
        <div className="tracking-courier">
          <span className="tracking-avatar" aria-hidden="true">
            <Icon name="bike" size={24} />
          </span>
          <div>
            <small>{translate("courier")}</small>
            {courier.firstName && (
              <strong>
                <bdi>{courier.firstName}</bdi>
              </strong>
            )}
          </div>
          {courier.phone !== null && (
            <a
              className="tracking-call"
              href={`tel:${courier.phone}`}
              aria-label={
                courier.firstName
                  ? translate("callCourier", { name: courier.firstName })
                  : translate("callUnnamedCourier")
              }
            >
              <Icon name="phone" size={22} />
            </a>
          )}
        </div>
      )}
      {tracking.restaurantPhone !== null && (
        <a className="tracking-call-restaurant" href={`tel:${tracking.restaurantPhone}`}>
          <Icon name="store" size={20} />
          {translate("callRestaurant")}
        </a>
      )}
    </div>
  );
}
