export type OrderStatus =
  | "scheduled"
  | "pending_acceptance"
  | "accepted"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "collected"
  | "rejected"
  | "expired"
  | "cancelled"
  | "delivery_failed";

type OrderFulfilment = "delivery" | "pickup";

/** Actor identity and current scope come from the authenticated service. */
export type OrderActor =
  | { readonly kind: "customer"; readonly id: string }
  | { readonly kind: "merchant"; readonly id: string; readonly merchantIds: readonly string[] }
  | {
      readonly kind: "courier";
      readonly id: string;
      readonly courierId: string;
      readonly merchantId: string;
    }
  | { readonly kind: "admin"; readonly id: string }
  | { readonly kind: "system"; readonly id: null };

type OrderEta = { readonly earliestAt: number; readonly latestAt: number };

/** All times are epoch milliseconds. An acceptance deadline starts on place or release. */
export type OrderSnapshot = {
  readonly id: string;
  readonly customerId: string | null;
  readonly merchantId: string;
  readonly fulfilment: OrderFulfilment;
  readonly status: OrderStatus;
  readonly courierId: string | null;
  readonly version: number;
  readonly lastEventAt: number;
  readonly scheduledFor: number | null;
  readonly releaseAt: number | null;
  readonly acceptanceDeadlineAt: number | null;
  readonly prepMinutes: number | null;
  readonly eta: OrderEta | null;
};

type PlacementFacts = {
  readonly orderId: string;
  readonly quoteCustomerId: string;
  readonly merchantId: string;
  readonly fulfilment: OrderFulfilment;
  readonly isQuoteValid: boolean;
  readonly isInsideServiceArea: boolean;
  readonly isInsideDeliveryZone: boolean;
  readonly meetsMinimumOrder: boolean;
  readonly hasContactPhone: boolean;
  readonly isWithinCashLimit: boolean;
  readonly isCustomerBlocked: boolean;
  readonly schedule:
    | {
        readonly kind: "asap";
        readonly isRestaurantOpen: boolean;
        readonly acceptanceTimeoutMs: number;
      }
    | {
        readonly kind: "scheduled";
        readonly scheduledFor: number;
        readonly releaseAt: number;
        readonly isSlotValid: boolean;
      };
};

type RejectionReason = "closed" | "too_busy" | "item_unavailable" | "other";
type ForceTarget = "cancelled" | "delivered" | "collected";

type DeliveryProof =
  | { readonly kind: "code"; readonly isCodeValid: boolean; readonly failedAttempts: number }
  | {
      readonly kind: "photo";
      readonly photoId: string;
      readonly reason: string;
      readonly isPhotoVerified: boolean;
    };

/** Facts are resolved and checked by the service. They are never decoded from request bodies. */
export type OrderAction =
  | { readonly kind: "place"; readonly facts: PlacementFacts }
  | { readonly kind: "release"; readonly facts: { readonly acceptanceTimeoutMs: number } }
  | { readonly kind: "cancel"; readonly reason: string }
  | {
      readonly kind: "accept";
      readonly prepMinutes: number;
      readonly facts: { readonly eta: OrderEta };
    }
  | {
      readonly kind: "reject";
      readonly reason: RejectionReason;
      readonly facts: { readonly soldOutItemIds: readonly string[] };
    }
  | { readonly kind: "expire" }
  | { readonly kind: "markReady" }
  | {
      readonly kind: "assignCourier";
      readonly courierId: string;
      readonly facts: {
        readonly courier: {
          readonly id: string;
          readonly merchantId: string;
          readonly isActive: boolean;
        } | null;
      };
    }
  | { readonly kind: "pickUp" }
  | { readonly kind: "deliver"; readonly facts: { readonly proof: DeliveryProof } }
  | {
      readonly kind: "fail";
      readonly reason: string;
      readonly facts: { readonly waitStartedAt: number | null; readonly callAttempts: number };
    }
  | { readonly kind: "collect" }
  | { readonly kind: "force"; readonly to: ForceTarget; readonly reason: string };

export type OrderCommand = {
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  /** Service fingerprint of the normalized request payload. Excludes changing facts and clock. */
  readonly requestFingerprint: string;
  readonly action: OrderAction;
};

type OrderEventActor = Pick<OrderActor, "kind" | "id">;

/** Payloads contain serialized event data rather than the service facts or delivery code. */
type OrderEventPayload =
  | { readonly kind: "place" | "release" | "expire" | "markReady" | "pickUp" | "collect" }
  | { readonly kind: "cancel" | "fail" | "force"; readonly reason: string }
  | { readonly kind: "accept"; readonly prepMinutes: number; readonly eta: OrderEta }
  | {
      readonly kind: "reject";
      readonly reason: RejectionReason;
      readonly soldOutItemIds: readonly string[];
    }
  | { readonly kind: "assignCourier"; readonly courierId: string }
  | {
      readonly kind: "deliver";
      readonly proof:
        | { readonly kind: "code" }
        | {
            readonly kind: "photo";
            readonly photoId: string;
            readonly reason: string;
          };
    };

export type OrderEvent = {
  readonly orderId: string;
  readonly actor: OrderEventActor;
  readonly from: OrderStatus | null;
  readonly to: OrderStatus;
  readonly payload: OrderEventPayload;
  readonly at: number;
  readonly version: number;
};

/** The service supplies the one receipt found in the applicable idempotency scope. */
export type OrderCommandReceipt = {
  readonly scope:
    | { readonly kind: "place"; readonly customerId: string }
    | { readonly kind: "order"; readonly orderId: string };
  readonly actor: OrderEventActor;
  readonly idempotencyKey: string;
  readonly action: OrderAction["kind"];
  readonly expectedVersion: number;
  readonly requestFingerprint: string;
  readonly order: OrderSnapshot;
};

export type TransitionInput = {
  readonly order: OrderSnapshot | null;
  readonly command: OrderCommand;
  readonly actor: OrderActor;
  readonly now: number;
  readonly priorReceipt?: OrderCommandReceipt;
};

export type OrderTransition =
  | {
      readonly kind: "applied";
      readonly order: OrderSnapshot;
      readonly event: OrderEvent;
      readonly receipt: OrderCommandReceipt;
    }
  | { readonly kind: "replayed"; readonly order: OrderSnapshot };

export type OrderTransitionError =
  | { readonly code: "order_forbidden" }
  | { readonly code: "order_conflict" }
  | { readonly code: "order_terminal" }
  | { readonly code: "invalid_order_transition" }
  | { readonly code: "invalid_order_command" }
  | { readonly code: "order_not_due" }
  | { readonly code: "idempotency_conflict" };
