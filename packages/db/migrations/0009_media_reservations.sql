CREATE TABLE public.media_uploads (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  owner_id uuid NOT NULL REFERENCES public.users(id),
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('application', 'cover', 'item', 'logo')),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/heic', 'image/webp')),
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 8388608),
  status text NOT NULL DEFAULT 'awaiting_upload',
  quarantine_key text UNIQUE CHECK (btrim(quarantine_key) <> ''),
  content_digest bytea CHECK (octet_length(content_digest) = 32),
  created_at timestamptz NOT NULL,
  adopted_at timestamptz,
  CONSTRAINT media_upload_target_check CHECK ((kind = 'application') = (merchant_id IS NULL)),
  CONSTRAINT media_upload_adoption_check CHECK (
    (status = 'awaiting_upload' AND quarantine_key IS NULL AND content_digest IS NULL AND adopted_at IS NULL)
    OR
    (status = 'preparing' AND quarantine_key IS NOT NULL AND content_digest IS NOT NULL AND adopted_at IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX media_uploads_owner_idx ON public.media_uploads (owner_id);
--> statement-breakpoint
CREATE INDEX media_uploads_merchant_idx ON public.media_uploads (merchant_id) WHERE merchant_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE public.media_command_receipts (
  actor_id uuid NOT NULL REFERENCES public.users(id),
  operation text NOT NULL CHECK (operation = 'reserve'),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  media_id uuid NOT NULL REFERENCES public.media_uploads(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, operation, key_hash)
);
--> statement-breakpoint
CREATE INDEX media_command_receipts_media_idx ON public.media_command_receipts (media_id);
