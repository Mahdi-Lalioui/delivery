CREATE FUNCTION public.notify_merchant_order_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  -- Durable events hold the details. NOTIFY only identifies the merchant to wake.
  PERFORM pg_notify('merchant_order_events', NEW.merchant_id::text);
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER order_events_notify_merchant
AFTER INSERT ON public.order_events
FOR EACH ROW EXECUTE FUNCTION public.notify_merchant_order_event();
