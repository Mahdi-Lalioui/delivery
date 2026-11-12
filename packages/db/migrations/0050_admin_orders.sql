CREATE INDEX orders_admin_recent_idx ON public.orders (placed_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX orders_admin_live_recent_idx ON public.orders (placed_at DESC, id DESC)
  WHERE status IN ('scheduled', 'pending_acceptance', 'accepted', 'ready', 'out_for_delivery');
--> statement-breakpoint
CREATE INDEX orders_admin_status_recent_idx ON public.orders (status, placed_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX orders_admin_code_recent_idx ON public.orders (short_code, placed_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX orders_admin_restaurant_idx ON public.orders USING gin (restaurant_name gin_trgm_ops);
--> statement-breakpoint
ALTER TABLE public.audit_log ADD COLUMN order_id uuid REFERENCES public.orders(id);
--> statement-breakpoint
CREATE INDEX audit_log_order_idx ON public.audit_log (order_id) WHERE order_id IS NOT NULL;
