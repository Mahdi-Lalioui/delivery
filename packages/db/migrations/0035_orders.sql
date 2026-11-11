CREATE TYPE public.order_status AS ENUM (
  'scheduled', 'pending_acceptance', 'accepted', 'ready', 'out_for_delivery',
  'delivered', 'collected', 'rejected', 'expired', 'cancelled', 'delivery_failed'
);
--> statement-breakpoint
CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  quote_id uuid NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.users(id),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  restaurant_name text NOT NULL,
  short_code text NOT NULL CHECK (short_code ~ '^[A-HJ-KM-NP-Z2-9]{3}-[A-HJ-KM-NP-Z2-9]{3}$'),
  order_day date NOT NULL,
  status public.order_status NOT NULL,
  fulfilment text NOT NULL CHECK (fulfilment IN ('pickup', 'delivery')),
  version integer NOT NULL CHECK (version > 0),
  placed_at timestamptz NOT NULL,
  last_event_at timestamptz NOT NULL CHECK (last_event_at >= placed_at),
  scheduled_for timestamptz,
  release_at timestamptz,
  acceptance_deadline_at timestamptz,
  prep_minutes smallint CHECK (prep_minutes BETWEEN 5 AND 120),
  eta_earliest_at timestamptz,
  eta_latest_at timestamptz,
  courier_id uuid,
  address_snapshot jsonb,
  subtotal_dzd integer NOT NULL CHECK (subtotal_dzd >= 0),
  delivery_fee_dzd integer NOT NULL CHECK (delivery_fee_dzd >= 0),
  total_dzd integer NOT NULL CHECK (total_dzd = subtotal_dzd::bigint + delivery_fee_dzd),
  paying_with_dzd integer NOT NULL CHECK (paying_with_dzd::bigint - total_dzd BETWEEN 0 AND 10000),
  confirm_by_phone boolean NOT NULL DEFAULT false,
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array'),
  UNIQUE (merchant_id, order_day, short_code),
  CHECK (fulfilment = 'delivery' OR (delivery_fee_dzd = 0 AND courier_id IS NULL AND address_snapshot IS NULL)),
  CHECK (status <> 'scheduled' OR (scheduled_for IS NOT NULL AND release_at IS NOT NULL AND release_at < scheduled_for)),
  CHECK (status <> 'pending_acceptance' OR acceptance_deadline_at IS NOT NULL),
  CHECK ((eta_earliest_at IS NULL AND eta_latest_at IS NULL)
    OR (eta_earliest_at IS NOT NULL AND eta_latest_at IS NOT NULL AND eta_earliest_at <= eta_latest_at))
);
--> statement-breakpoint
CREATE INDEX orders_customer_recent_idx ON public.orders (customer_id, placed_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX orders_merchant_board_idx ON public.orders (merchant_id, status, placed_at, id);
--> statement-breakpoint
CREATE TABLE public.order_events (
  order_id uuid NOT NULL REFERENCES public.orders(id),
  version integer NOT NULL CHECK (version > 0),
  from_status public.order_status,
  to_status public.order_status NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('customer', 'merchant', 'courier', 'admin', 'system')),
  actor_id uuid REFERENCES public.users(id),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (order_id, version),
  CHECK ((version = 1) = (from_status IS NULL))
);
--> statement-breakpoint
CREATE TABLE public.order_placement_receipts (
  customer_id uuid NOT NULL REFERENCES public.users(id),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (customer_id, key_hash)
);
--> statement-breakpoint
CREATE INDEX order_placement_receipts_created_idx ON public.order_placement_receipts (created_at);
