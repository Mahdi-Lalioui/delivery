ALTER TABLE public.ratings
  ADD COLUMN id uuid NOT NULL DEFAULT uuidv7(),
  ADD CONSTRAINT ratings_id_unique UNIQUE (id);
--> statement-breakpoint
CREATE TABLE public.order_rating_receipts (
  customer_id uuid NOT NULL REFERENCES public.users(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (customer_id, order_id, key_hash)
);
--> statement-breakpoint
CREATE INDEX order_rating_receipts_expiry_idx ON public.order_rating_receipts (expires_at);
