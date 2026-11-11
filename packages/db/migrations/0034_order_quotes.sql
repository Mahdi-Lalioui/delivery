CREATE TABLE public.merchant_order_settings (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id),
  pickup_enabled boolean NOT NULL DEFAULT false,
  delivery_enabled boolean NOT NULL DEFAULT false,
  pickup_minimum_dzd integer NOT NULL DEFAULT 0 CHECK (pickup_minimum_dzd >= 0),
  prep_minutes smallint NOT NULL DEFAULT 20 CHECK (prep_minutes BETWEEN 5 AND 120)
);
--> statement-breakpoint
CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  polygon geography(MultiPolygon, 4326),
  radius_m integer CHECK (radius_m BETWEEN 100 AND 100000),
  active boolean NOT NULL DEFAULT true,
  fee_dzd integer NOT NULL CHECK (fee_dzd >= 0),
  minimum_dzd integer NOT NULL CHECK (minimum_dzd >= 0),
  travel_minutes smallint NOT NULL CHECK (travel_minutes BETWEEN 1 AND 120),
  priority smallint NOT NULL DEFAULT 0,
  CHECK (num_nonnulls(polygon, radius_m) = 1),
  CHECK (polygon IS NULL OR (NOT ST_IsEmpty(polygon::geometry) AND ST_IsValid(polygon::geometry)))
);
--> statement-breakpoint
CREATE INDEX delivery_zones_merchant_idx ON public.delivery_zones (merchant_id, priority DESC, id)
  WHERE active;
--> statement-breakpoint
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  customer_id uuid NOT NULL REFERENCES public.users(id),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  breakdown jsonb NOT NULL CHECK (jsonb_typeof(breakdown) = 'object'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at = created_at + interval '10 minutes')
);
--> statement-breakpoint
CREATE INDEX quotes_customer_idx ON public.quotes (customer_id, id);
--> statement-breakpoint
CREATE INDEX quotes_expires_idx ON public.quotes (expires_at);
