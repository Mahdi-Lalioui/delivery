ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.addresses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY addresses_customer ON public.addresses
  USING (user_id::text = current_setting('awid.customer_id', true))
  WITH CHECK (user_id::text = current_setting('awid.customer_id', true));
