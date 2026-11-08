INSERT INTO public.platform_settings (key, value) VALUES
  ('order_accept_timeout_seconds', '480'::jsonb),
  ('first_order_cash_cap_dzd', '6000'::jsonb),
  ('maintenance_banner', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
CREATE TABLE public.platform_command_receipts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  entity text NOT NULL CHECK (entity IN ('setting', 'flag')),
  entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 128 AND btrim(entity_id) = entity_id),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  diff jsonb NOT NULL CHECK (jsonb_typeof(diff) = 'object' AND diff ?& ARRAY['before', 'after']),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz(3) NOT NULL,
  UNIQUE (actor_id, entity, key_hash)
);
--> statement-breakpoint
CREATE INDEX platform_command_receipts_created_idx
  ON public.platform_command_receipts (created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX platform_command_receipts_actor_created_idx
  ON public.platform_command_receipts (actor_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX platform_command_receipts_entity_created_idx
  ON public.platform_command_receipts (entity, created_at DESC, id DESC);
