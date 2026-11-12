ALTER TABLE public.otp_challenges
  DROP CONSTRAINT otp_challenges_purpose_check,
  ADD COLUMN binding_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN binding_session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  ADD CONSTRAINT otp_challenges_bound_purpose_check CHECK (
    (purpose IN ('sign_in', 'admin_sign_in') AND binding_user_id IS NULL AND binding_session_id IS NULL)
    OR (purpose = 'identifier_change' AND binding_user_id IS NOT NULL AND binding_session_id IS NOT NULL)
  );
--> statement-breakpoint
CREATE INDEX otp_challenges_binding_user_idx
  ON public.otp_challenges (binding_user_id) WHERE binding_user_id IS NOT NULL;
