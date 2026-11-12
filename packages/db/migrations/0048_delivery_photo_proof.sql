ALTER TABLE public.media_uploads
  DROP CONSTRAINT media_uploads_kind_check,
  ADD CONSTRAINT media_uploads_kind_check CHECK (kind IN ('application', 'cover', 'item', 'logo', 'delivery_proof')),
  ADD COLUMN delivery_proof_purging boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT media_delivery_proof_purging_scope CHECK (NOT delivery_proof_purging OR kind = 'delivery_proof'),
  ADD COLUMN delivery_order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  ADD CONSTRAINT media_delivery_proof_scope CHECK ((kind = 'delivery_proof') = (delivery_order_id IS NOT NULL));
--> statement-breakpoint
CREATE INDEX media_delivery_proof_order_idx ON public.media_uploads (delivery_order_id) WHERE delivery_order_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE public.order_delivery_photo_proofs (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL UNIQUE REFERENCES public.media_uploads(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  submitted_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX order_delivery_proof_merchant_idx ON public.order_delivery_photo_proofs (merchant_id, submitted_at DESC);
