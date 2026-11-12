ALTER TABLE public.merchants ADD COLUMN first_published_at timestamptz;
--> statement-breakpoint
CREATE INDEX merchants_first_publication_idx ON public.merchants (first_published_at, id)
  WHERE status = 'active' AND NOT is_demo AND first_published_at IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION public.record_merchant_first_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status = 'approved' OR OLD.is_demo THEN
    NEW.first_published_at := statement_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER merchants_first_publication
  BEFORE INSERT OR UPDATE OF status, is_demo ON public.merchants
  FOR EACH ROW WHEN (NEW.status = 'active' AND NOT NEW.is_demo AND NEW.first_published_at IS NULL)
  EXECUTE FUNCTION public.record_merchant_first_publication();
