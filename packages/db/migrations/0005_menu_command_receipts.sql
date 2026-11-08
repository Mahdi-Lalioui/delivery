CREATE TABLE public.menu_command_receipts (
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  operation text NOT NULL CHECK (operation IN ('category_create', 'category_rename', 'category_reorder')),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (merchant_id, actor_id, operation, key_hash)
);
--> statement-breakpoint
CREATE INDEX menu_command_receipts_actor_idx
  ON public.menu_command_receipts (actor_id, merchant_id);
