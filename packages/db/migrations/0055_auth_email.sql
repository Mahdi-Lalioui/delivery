ALTER TABLE public.users
  DROP CONSTRAINT users_check,
  ADD COLUMN email text UNIQUE CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
  ADD CONSTRAINT users_active_identifier_check
    CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL OR deleted_at IS NOT NULL);
--> statement-breakpoint
ALTER TABLE public.otp_challenges
  ALTER COLUMN phone_e164 DROP NOT NULL,
  ADD COLUMN email text CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
  ADD CONSTRAINT otp_challenges_one_identifier CHECK ((phone_e164 IS NULL) <> (email IS NULL)),
  ADD CONSTRAINT otp_challenges_email_idempotency_unique UNIQUE (email, idempotency_key_hash);
--> statement-breakpoint
CREATE INDEX otp_challenges_email_requested_at_idx
  ON public.otp_challenges (email, requested_at DESC) WHERE email IS NOT NULL;
