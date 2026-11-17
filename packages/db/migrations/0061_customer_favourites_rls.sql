ALTER TABLE public.customer_favourites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.customer_favourites FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_favourites_owner ON public.customer_favourites
  USING (customer_id::text = current_setting('awid.customer_id', true))
  WITH CHECK (customer_id::text = current_setting('awid.customer_id', true));
