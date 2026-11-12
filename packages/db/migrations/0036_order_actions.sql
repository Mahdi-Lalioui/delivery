ALTER TABLE public.orders ADD COLUMN travel_minutes smallint NOT NULL DEFAULT 0
  CHECK (travel_minutes BETWEEN 0 AND 120);
--> statement-breakpoint
CREATE TABLE public.order_action_receipts (
  order_id uuid NOT NULL REFERENCES public.orders(id),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  PRIMARY KEY (order_id, actor_id, key_hash)
);
--> statement-breakpoint
CREATE INDEX order_action_receipts_actor_idx ON public.order_action_receipts (actor_id);
--> statement-breakpoint
CREATE INDEX order_events_customer_actor_idx ON public.order_events (actor_id) WHERE actor_kind = 'customer';
