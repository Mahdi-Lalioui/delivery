CREATE TABLE public.merchant_order_streams (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id),
  latest bigint NOT NULL CHECK (latest > 0)
);
--> statement-breakpoint
ALTER TABLE public.order_events
  ADD COLUMN merchant_id uuid REFERENCES public.merchants(id),
  ADD COLUMN merchant_sequence bigint CHECK (merchant_sequence > 0);
--> statement-breakpoint
WITH history AS (
  SELECT event.order_id, event.version, orders.merchant_id,
    row_number() OVER (PARTITION BY orders.merchant_id ORDER BY event.occurred_at, event.order_id, event.version) AS position
  FROM public.order_events AS event JOIN public.orders AS orders ON orders.id = event.order_id
)
UPDATE public.order_events AS event SET merchant_id = history.merchant_id, merchant_sequence = history.position
FROM history WHERE event.order_id = history.order_id AND event.version = history.version;
--> statement-breakpoint
INSERT INTO public.merchant_order_streams (merchant_id, latest)
SELECT merchant_id, max(merchant_sequence) FROM public.order_events GROUP BY merchant_id;
--> statement-breakpoint
ALTER TABLE public.order_events
  ALTER COLUMN merchant_id SET NOT NULL,
  ALTER COLUMN merchant_sequence SET NOT NULL,
  ADD UNIQUE (merchant_id, merchant_sequence);
--> statement-breakpoint
CREATE FUNCTION public.number_merchant_order_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  SELECT merchant_id INTO STRICT NEW.merchant_id FROM public.orders WHERE id = NEW.order_id;

  -- Per-merchant row locking keeps sequence order aligned with transaction commit order.
  INSERT INTO public.merchant_order_streams AS stream (merchant_id, latest)
  VALUES (NEW.merchant_id, 1)
  ON CONFLICT (merchant_id) DO UPDATE SET latest = stream.latest + 1
  RETURNING latest INTO NEW.merchant_sequence;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER order_events_number_for_merchant
BEFORE INSERT ON public.order_events
FOR EACH ROW EXECUTE FUNCTION public.number_merchant_order_event();
