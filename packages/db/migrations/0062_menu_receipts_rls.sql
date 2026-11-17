ALTER TABLE public.menu_command_receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.menu_command_receipts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_command_receipts_actor ON public.menu_command_receipts
  USING (
    merchant_id = nullif(current_setting('awid.merchant_id', true), '')::uuid
    AND actor_id = nullif(current_setting('awid.menu_actor_id', true), '')::uuid
  );
