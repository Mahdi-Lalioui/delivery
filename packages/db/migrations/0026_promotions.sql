CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  code text CHECK (length(code) BETWEEN 1 AND 64 AND btrim(code) = code),
  discount jsonb NOT NULL CHECK (
    jsonb_typeof(discount) = 'object' AND discount ? 'kind'
      AND discount->>'kind' IN ('percent', 'fixed', 'free_delivery')
  ),
  conditions jsonb NOT NULL CHECK (jsonb_typeof(conditions) = 'object'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at >= created_at)
);
--> statement-breakpoint
CREATE INDEX promotions_merchant_id_idx ON public.promotions (merchant_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX promotions_merchant_code_idx ON public.promotions (merchant_id, lower(code))
  WHERE code IS NOT NULL;
--> statement-breakpoint
CREATE TABLE public.promotion_redemptions (
  promotion_id uuid NOT NULL REFERENCES public.promotions(id),
  order_id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.users(id),
  sales_dzd integer NOT NULL CHECK (sales_dzd >= 0)
);
--> statement-breakpoint
CREATE INDEX promotion_redemptions_promo_customer_idx ON public.promotion_redemptions (promotion_id, customer_id);
--> statement-breakpoint
CREATE INDEX promotion_redemptions_customer_idx ON public.promotion_redemptions (customer_id);
--> statement-breakpoint
CREATE TABLE public.promotion_command_receipts (
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  operation text NOT NULL CHECK (operation IN ('create', 'update')),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (merchant_id, actor_id, operation, key_hash)
);
--> statement-breakpoint
CREATE INDEX promotion_command_receipts_actor_idx ON public.promotion_command_receipts (actor_id);
