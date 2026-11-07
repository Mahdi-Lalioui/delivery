CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  phone_e164 text NOT NULL UNIQUE CHECK (phone_e164 ~ '^\+213[567][0-9]{8}$'),
  created_at timestamptz NOT NULL,
  blocked_at timestamptz,
  deleted_at timestamptz
);
--> statement-breakpoint
CREATE TABLE public.otp_challenges (
  id uuid PRIMARY KEY,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+213[567][0-9]{8}$'),
  request_ip inet NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('sign_in', 'admin_sign_in')),
  code_hmac bytea NOT NULL CHECK (octet_length(code_hmac) = 32),
  idempotency_key_hash bytea NOT NULL CHECK (octet_length(idempotency_key_hash) = 32),
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > requested_at),
  sms_delivered_at timestamptz,
  consumed_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  UNIQUE (phone_e164, idempotency_key_hash)
);
--> statement-breakpoint
CREATE INDEX otp_challenges_phone_requested_at_idx
  ON public.otp_challenges (phone_e164, requested_at DESC);
--> statement-breakpoint
CREATE INDEX otp_challenges_ip_requested_at_idx
  ON public.otp_challenges (request_ip, requested_at DESC);
--> statement-breakpoint
CREATE TABLE public.admins (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  totp_secret_encrypted bytea NOT NULL CHECK (octet_length(totp_secret_encrypted) > 0),
  last_totp_step bigint CHECK (last_totp_step >= 0)
);
--> statement-breakpoint
CREATE TABLE public.admin_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.admins(user_id) ON DELETE CASCADE,
  otp_challenge_id uuid NOT NULL UNIQUE REFERENCES public.otp_challenges(id) ON DELETE CASCADE,
  transport text NOT NULL CHECK (transport IN ('web', 'bearer')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  consumed_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE INDEX admin_challenges_user_id_idx ON public.admin_challenges (user_id);
--> statement-breakpoint
CREATE TABLE public.otp_verification_receipts (
  challenge_id uuid NOT NULL REFERENCES public.otp_challenges(id) ON DELETE CASCADE,
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  outcome text NOT NULL CHECK (outcome IN ('invalid', 'locked', 'consumed')),
  PRIMARY KEY (challenge_id, key_hash)
);
--> statement-breakpoint
CREATE TABLE public.admin_verification_receipts (
  challenge_id uuid NOT NULL REFERENCES public.admin_challenges(id) ON DELETE CASCADE,
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  outcome text NOT NULL CHECK (outcome IN ('invalid', 'locked', 'consumed')),
  PRIMARY KEY (challenge_id, key_hash)
);
--> statement-breakpoint
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  transport text NOT NULL CHECK (transport IN ('web', 'bearer')),
  kind text NOT NULL CHECK (kind IN ('standard', 'admin')),
  device_name text CHECK (char_length(device_name) BETWEEN 1 AND 120),
  request_ip inet NOT NULL,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL CHECK (last_seen_at >= created_at),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  revoked_at timestamptz
);
--> statement-breakpoint
CREATE INDEX sessions_user_id_idx ON public.sessions (user_id);
--> statement-breakpoint
CREATE INDEX sessions_live_user_expiry_idx
  ON public.sessions (user_id, expires_at) WHERE revoked_at IS NULL;
