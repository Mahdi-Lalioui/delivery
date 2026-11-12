ALTER TABLE public.orders
  ADD COLUMN delivery_code_digest bytea CHECK (octet_length(delivery_code_digest) = 32),
  ADD COLUMN delivery_code_attempts smallint NOT NULL DEFAULT 0 CHECK (delivery_code_attempts BETWEEN 0 AND 5),
  ADD CONSTRAINT orders_active_delivery_digest CHECK (
    delivery_code_digest IS NULL OR (status = 'out_for_delivery' AND fulfilment = 'delivery')
  );
