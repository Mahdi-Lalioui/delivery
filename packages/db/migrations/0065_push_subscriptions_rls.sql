ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY push_subscriptions_customer ON public.push_subscriptions
  USING (user_id::text = current_setting('awid.customer_id', true))
  WITH CHECK (user_id::text = current_setting('awid.customer_id', true));
--> statement-breakpoint
CREATE POLICY push_subscriptions_expired_cleanup ON public.push_subscriptions
  FOR DELETE
  USING (
    expires_ms <= extract(epoch FROM statement_timestamp()) * 1000
    OR EXISTS (
      SELECT FROM public.sessions AS session
      WHERE session.id = session_id
        AND (session.revoked_at IS NOT NULL OR session.expires_at <= statement_timestamp())
    )
  );
--> statement-breakpoint
CREATE POLICY push_subscriptions_expired_cleanup_read ON public.push_subscriptions
  FOR SELECT
  USING (
    expires_ms <= extract(epoch FROM statement_timestamp()) * 1000
    OR EXISTS (
      SELECT FROM public.sessions AS session
      WHERE session.id = session_id
        AND (session.revoked_at IS NOT NULL OR session.expires_at <= statement_timestamp())
    )
  );
