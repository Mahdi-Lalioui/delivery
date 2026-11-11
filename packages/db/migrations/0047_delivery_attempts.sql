CREATE TABLE public.courier_delivery_attempts (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers(id),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  action text NOT NULL CHECK (action IN ('start_wait', 'call')),
  occurred_at timestamptz NOT NULL,
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  PRIMARY KEY (order_id, courier_id, key_hash)
);
--> statement-breakpoint
CREATE UNIQUE INDEX courier_delivery_wait_idx ON public.courier_delivery_attempts (order_id)
  WHERE action = 'start_wait';
