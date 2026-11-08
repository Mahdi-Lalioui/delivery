CREATE TABLE public.merchant_staff_invitations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+213[567][0-9]{8}$'),
  role text NOT NULL CHECK (role IN ('manager', 'staff')),
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  invited_by uuid NOT NULL REFERENCES public.users(id),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  created_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL CHECK (expires_at > created_at),
  consumed_at timestamptz(3) CHECK (consumed_at >= created_at),
  consumed_by uuid REFERENCES public.users(id),
  revoked_at timestamptz(3) CHECK (revoked_at >= created_at),
  CHECK ((consumed_at IS NULL) = (consumed_by IS NULL)),
  CHECK (consumed_at IS NULL OR revoked_at IS NULL),
  UNIQUE (merchant_id, invited_by, key_hash)
);
--> statement-breakpoint
CREATE UNIQUE INDEX merchant_staff_invitations_open_phone_idx
  ON public.merchant_staff_invitations (merchant_id, phone_e164)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
--> statement-breakpoint
CREATE INDEX merchant_staff_invitations_open_list_idx
  ON public.merchant_staff_invitations (merchant_id, created_at, id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
