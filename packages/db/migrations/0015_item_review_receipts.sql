CREATE TABLE public.item_review_receipts (
  actor_id uuid NOT NULL REFERENCES public.users(id),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  result_status text NOT NULL CHECK (result_status IN ('approved', 'rejected')),
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, key_hash)
);
--> statement-breakpoint
CREATE INDEX item_review_receipts_item_idx ON public.item_review_receipts (item_id);
--> statement-breakpoint
CREATE INDEX item_review_receipts_merchant_idx ON public.item_review_receipts (merchant_id);
--> statement-breakpoint
CREATE INDEX items_held_for_review_idx ON public.items (id)
  WHERE moderation_status = 'blocked_pending_review' AND archived_at IS NULL;
