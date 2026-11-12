ALTER TABLE public.merchant_staff_invitations
  ALTER COLUMN phone_e164 DROP NOT NULL,
  ADD COLUMN email text CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
  ADD CONSTRAINT staff_invitation_one_contact CHECK ((phone_e164 IS NULL) <> (email IS NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX merchant_staff_invitations_open_email_idx
  ON public.merchant_staff_invitations (merchant_id, email)
  WHERE consumed_at IS NULL AND revoked_at IS NULL AND email IS NOT NULL;
--> statement-breakpoint
ALTER TABLE public.courier_invitations
  ALTER COLUMN phone_e164 DROP NOT NULL,
  ADD COLUMN email text CHECK (email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
  ADD CONSTRAINT courier_invitation_one_contact CHECK ((phone_e164 IS NULL) <> (email IS NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX courier_invitations_open_email_idx
  ON public.courier_invitations (merchant_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL AND email IS NOT NULL;
