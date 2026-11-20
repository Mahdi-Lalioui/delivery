-- Existing invitations have no provider receipt. Do not send them a second time on a retry.
ALTER TABLE public.courier_invitations ADD COLUMN delivery_state text NOT NULL DEFAULT 'uncertain'
  CHECK (delivery_state IN ('ready', 'uncertain', 'sent'));
--> statement-breakpoint
ALTER TABLE public.courier_invitations ALTER COLUMN delivery_state SET DEFAULT 'ready';
--> statement-breakpoint
ALTER TABLE public.merchant_staff_invitations ADD COLUMN delivery_state text NOT NULL DEFAULT 'uncertain'
  CHECK (delivery_state IN ('ready', 'uncertain', 'sent'));
--> statement-breakpoint
ALTER TABLE public.merchant_staff_invitations ALTER COLUMN delivery_state SET DEFAULT 'ready';
