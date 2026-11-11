CREATE TABLE public.billing_command_receipts (
  actor_id uuid NOT NULL REFERENCES public.users(id),
  operation text NOT NULL CHECK (operation IN ('invoice_issue', 'invoice_void', 'payment_record', 'settings_update')),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  target_id uuid,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  recorded_at timestamptz NOT NULL,
  CHECK ((operation = 'settings_update') = (target_id IS NULL)),
  PRIMARY KEY (actor_id, operation, key_hash)
);
--> statement-breakpoint
ALTER TABLE public.billing_payments ADD COLUMN confirmed_by uuid REFERENCES public.users(id);
--> statement-breakpoint
CREATE INDEX billing_payments_confirmed_by_idx ON public.billing_payments (confirmed_by)
  WHERE confirmed_by IS NOT NULL;
