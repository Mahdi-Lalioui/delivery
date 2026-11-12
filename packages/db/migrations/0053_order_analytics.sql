CREATE INDEX orders_analytics_merchant_day_idx ON public.orders (merchant_id, order_day);
--> statement-breakpoint
CREATE INDEX orders_analytics_day_idx ON public.orders (order_day, merchant_id);
