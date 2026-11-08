ALTER TABLE public.items
  ADD COLUMN price_version bigint NOT NULL DEFAULT 0 CHECK (price_version >= 0);
--> statement-breakpoint
-- Existing history has no verifiable applied version.
ALTER TABLE public.price_history
  ADD COLUMN applied_price_version bigint CHECK (applied_price_version >= 0);
--> statement-breakpoint
CREATE FUNCTION public.track_item_price_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.price_dzd IS DISTINCT FROM OLD.price_dzd THEN
    NEW.price_version := OLD.price_version + 1;
  ELSE
    NEW.price_version := OLD.price_version;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER items_track_price_version
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  WHEN (OLD.price_dzd IS DISTINCT FROM NEW.price_dzd
    OR OLD.price_version IS DISTINCT FROM NEW.price_version)
  EXECUTE FUNCTION public.track_item_price_version();
