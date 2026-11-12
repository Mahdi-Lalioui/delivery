ALTER TABLE public.couriers ADD COLUMN last_position_request_at timestamptz;
--> statement-breakpoint
CREATE TABLE public.courier_positions (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers(id),
  location geography(Point, 4326) NOT NULL,
  accuracy_m double precision NOT NULL CHECK (accuracy_m BETWEEN 0 AND 100),
  heading double precision CHECK (heading >= 0 AND heading < 360),
  captured_at timestamptz NOT NULL,
  PRIMARY KEY (order_id, captured_at)
);
--> statement-breakpoint
CREATE INDEX courier_positions_retention_idx ON public.courier_positions (captured_at);
--> statement-breakpoint
CREATE INDEX courier_positions_driver_idx ON public.courier_positions (courier_id);
