CREATE OR REPLACE FUNCTION public.notify_merchant_order_event()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_notify('merchant_order_events', NEW.merchant_id::text);
  PERFORM pg_notify('order_status_events', NEW.order_id::text);
  RETURN NEW;
END
$$;
