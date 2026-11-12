CREATE TABLE public.couriers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  display_name text CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  active boolean NOT NULL DEFAULT true,
  online boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  UNIQUE (id, merchant_id),
  CHECK (active OR NOT online)
);
--> statement-breakpoint
CREATE INDEX couriers_merchant_active_idx ON public.couriers (merchant_id, id) WHERE active;
--> statement-breakpoint
CREATE TABLE public.courier_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  invited_by uuid NOT NULL REFERENCES public.users(id),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+213[567][0-9]{8}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  accepted_by uuid REFERENCES public.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  CHECK ((accepted_by IS NULL) = (accepted_at IS NULL)),
  CHECK (accepted_at IS NULL OR (accepted_at >= created_at AND accepted_at < expires_at AND revoked_at IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX courier_invitations_open_idx ON public.courier_invitations (merchant_id, phone_e164)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
--> statement-breakpoint
CREATE INDEX courier_invitations_phone_idx ON public.courier_invitations (phone_e164);
