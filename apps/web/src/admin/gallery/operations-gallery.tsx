"use client";

import type { Locale } from "@zaafran/i18n/locales";
import type { AdminOrderPage } from "../orders/orders-http";
import { OrderList } from "../orders/admin-orders-screen";
import type { Jobs } from "../../courier/courier-http";
import { CourierJob } from "../../courier/courier-job";
import type { Board } from "../../merchant-board/board-http";
import { BoardColumns } from "../../merchant-board/board-screen";

const merchantId = "00000000-0000-4000-8000-000000000031";
const orderId = "00000000-0000-4000-8000-000000000032";
const restaurantName = "Table fictive de la Casbah";
const order = {
  orderId,
  merchantId,
  shortCode: "K7M-4QX",
  version: 3,
  placedAt: "2026-11-12T11:15:00.000Z",
  scheduledFor: null,
  acceptanceDeadlineAt: null,
  eta: null,
  fulfilment: "delivery",
  status: "ready",
  totalDzd: 1380,
} as const;

const board: Board = {
  orders: [
    {
      ...order,
      lines: [
        {
          itemId: "00000000-0000-4000-8000-000000000033",
          names: { ar: "كسكس بالخضار", fr: "Couscous aux légumes", en: "Vegetable couscous" },
          quantity: 2,
          options: [],
          note: "",
        },
      ],
      changeDzd: 620,
      confirmByPhone: false,
      canHandover: false,
    },
  ],
  events: [],
  cursor: "0",
  hasMore: false,
};

const courier: Jobs["jobs"][number] = {
  order,
  pickup: { restaurantName, pin: { latitude: 36.7846, longitude: 3.0586 } },
  dropoff: {
    pin: { latitude: 36.781, longitude: 3.054 },
    communeId: null,
    landmark: "Près de la place",
    plusCode: "8F85Q3J3+VJ",
  },
  customerFirstName: null,
  customerPhone: null,
  changeDzd: 620,
  deliveryAttempt: { waitStartedAt: null, callAttempts: 0 },
};

const adminPage: AdminOrderPage = {
  orders: [{ ...order, restaurantName }],
  sessionId: "00000000-0000-4000-8000-000000000034",
  nextCursor: null,
};
const noop = () => undefined;

export function OperationsGallery({
  locale,
  labels,
}: {
  locale: Locale;
  labels: { merchant: string; courier: string; admin: string };
}) {
  return (
    <div className="operations-gallery">
      <details>
        <summary>{labels.merchant}</summary>
        <BoardColumns board={board} locale={locale} offline refresh={noop} />
      </details>
      <details>
        <summary>{labels.courier}</summary>
        <CourierJob job={courier} locale={locale} offline refresh={noop} />
      </details>
      <details>
        <summary>{labels.admin}</summary>
        <OrderList page={adminPage} selected={orderId} locale={locale} onSelect={noop} />
      </details>
    </div>
  );
}
