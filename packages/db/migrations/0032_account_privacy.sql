ALTER TABLE public.users
  ALTER COLUMN phone_e164 DROP NOT NULL,
  ADD CHECK (phone_e164 IS NOT NULL OR deleted_at IS NOT NULL);
--> statement-breakpoint
ALTER TABLE public.sessions
  ALTER COLUMN request_ip DROP NOT NULL,
  ADD CHECK (request_ip IS NOT NULL OR revoked_at IS NOT NULL);
--> statement-breakpoint
ALTER TABLE public.promotion_redemptions ALTER COLUMN customer_id DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE public.account_deletion_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id),
  ip_hash bytea NOT NULL CHECK (octet_length(ip_hash) = 32),
  key_hash bytea CHECK (octet_length(key_hash) = 32),
  code_hmac bytea CHECK (octet_length(code_hmac) = 32),
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > requested_at),
  delivered_at timestamptz CHECK (delivered_at >= requested_at AND delivered_at < expires_at),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE INDEX account_deletion_challenges_user_time_idx
  ON public.account_deletion_challenges (user_id, requested_at DESC);
--> statement-breakpoint
CREATE INDEX account_deletion_challenges_ip_time_idx
  ON public.account_deletion_challenges (ip_hash, requested_at DESC);
--> statement-breakpoint
CREATE INDEX account_deletion_challenges_user_key_idx
  ON public.account_deletion_challenges (user_id, key_hash, expires_at DESC)
  WHERE key_hash IS NOT NULL;
--> statement-breakpoint
CREATE TABLE public.account_deletion_proofs (
  challenge_id uuid PRIMARY KEY REFERENCES public.account_deletion_challenges(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  code_hmac bytea NOT NULL CHECK (octet_length(code_hmac) = 32),
  deleted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > deleted_at)
);
--> statement-breakpoint
CREATE INDEX account_deletion_proofs_session_idx ON public.account_deletion_proofs (session_id);
--> statement-breakpoint
CREATE TABLE public.account_deletion_audit (
  user_id uuid PRIMARY KEY REFERENCES public.users(id),
  action text NOT NULL DEFAULT 'account_deleted' CHECK (action = 'account_deleted'),
  created_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX merchant_staff_invitations_phone_idx
  ON public.merchant_staff_invitations (phone_e164);
--> statement-breakpoint
CREATE INDEX account_deletion_proofs_expiry_idx ON public.account_deletion_proofs (expires_at);
--> statement-breakpoint
CREATE INDEX account_deletion_challenges_expiry_idx ON public.account_deletion_challenges (expires_at)
  WHERE key_hash IS NOT NULL OR code_hmac IS NOT NULL;
--> statement-breakpoint
CREATE INDEX account_deletion_challenges_requested_idx ON public.account_deletion_challenges (requested_at);
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE public.auth_otp_rate_key (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret bytea NOT NULL CHECK (octet_length(secret) = 32)
);
--> statement-breakpoint
INSERT INTO public.auth_otp_rate_key (secret) VALUES (public.gen_random_bytes(32));
--> statement-breakpoint
CREATE FUNCTION public.auth_otp_rate_digest(kind text, value text)
RETURNS bytea
LANGUAGE sql STABLE STRICT
RETURN (
  SELECT public.hmac(convert_to(kind || ':' || value, 'UTF8'), secret, 'sha256')
  FROM public.auth_otp_rate_key WHERE singleton
);
--> statement-breakpoint
CREATE TABLE public.auth_otp_rate_history (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  phone_hash bytea NOT NULL CHECK (octet_length(phone_hash) = 32),
  ip_hash bytea NOT NULL CHECK (octet_length(ip_hash) = 32),
  requested_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX auth_otp_rate_history_phone_idx
  ON public.auth_otp_rate_history (phone_hash, requested_at DESC);
--> statement-breakpoint
CREATE INDEX auth_otp_rate_history_ip_idx
  ON public.auth_otp_rate_history (ip_hash, requested_at DESC);
--> statement-breakpoint
CREATE INDEX auth_otp_rate_history_requested_idx
  ON public.auth_otp_rate_history (requested_at);
--> statement-breakpoint
CREATE TABLE public.application_media_artifacts (
  media_id uuid NOT NULL REFERENCES public.media_uploads(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (btrim(key) <> ''),
  PRIMARY KEY (media_id, key)
);
