ALTER TABLE public.orders ADD CONSTRAINT orders_merchant_courier_fk
  FOREIGN KEY (courier_id, merchant_id) REFERENCES public.couriers (id, merchant_id);
--> statement-breakpoint
CREATE INDEX orders_courier_jobs_idx ON public.orders (courier_id, merchant_id, placed_at, id)
  WHERE status IN ('accepted', 'ready', 'out_for_delivery');
