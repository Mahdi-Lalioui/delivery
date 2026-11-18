ALTER TABLE public.auth_otp_rate_history
  ADD COLUMN account_hash bytea CHECK (account_hash IS NULL OR octet_length(account_hash) = 32);
--> statement-breakpoint
CREATE INDEX auth_otp_rate_history_account_idx
  ON public.auth_otp_rate_history (account_hash, requested_at DESC)
  WHERE account_hash IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION public.archive_auth_otp_rate_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.auth_otp_rate_history (phone_hash, ip_hash, account_hash, requested_at)
  VALUES (
    public.auth_otp_rate_digest(
      CASE WHEN OLD.email IS NULL THEN 'phone' ELSE 'email' END,
      coalesce(OLD.email, OLD.phone_e164)
    ),
    public.auth_otp_rate_digest('ip', host(OLD.request_ip)),
    CASE WHEN OLD.binding_user_id IS NULL THEN NULL
      ELSE public.auth_otp_rate_digest('account', OLD.binding_user_id::text) END,
    OLD.requested_at
  );
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER otp_challenges_archive_rate_history_before_delete
BEFORE DELETE ON public.otp_challenges
FOR EACH ROW EXECUTE FUNCTION public.archive_auth_otp_rate_history();
