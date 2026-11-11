CREATE TABLE public.search_documents (
  entity_type text NOT NULL CHECK (entity_type IN ('restaurant', 'dish')),
  entity_id uuid NOT NULL,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  source_text text NOT NULL,
  screened_content jsonb,
  normalized_text text NOT NULL CHECK (normalized_text <> ''),
  skeleton text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', normalized_text)) STORED,
  PRIMARY KEY (entity_type, entity_id, source_text),
  CHECK (entity_type <> 'restaurant' OR entity_id = merchant_id)
);
--> statement-breakpoint
CREATE INDEX search_documents_merchant_idx ON public.search_documents (merchant_id);
--> statement-breakpoint
CREATE INDEX search_documents_text_idx ON public.search_documents USING gin (normalized_text gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX search_documents_skeleton_idx ON public.search_documents USING gin (skeleton gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX search_documents_vector_idx ON public.search_documents USING gin (search_vector);
--> statement-breakpoint
CREATE TABLE public.search_document_refreshes (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  version bigint NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE INDEX search_document_refreshes_pending_idx
  ON public.search_document_refreshes (requested_at, merchant_id);
--> statement-breakpoint
CREATE FUNCTION public.queue_search_document_refresh()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_TABLE_NAME = 'merchants' THEN
    INSERT INTO public.search_document_refreshes (merchant_id) VALUES (NEW.id)
      ON CONFLICT (merchant_id) DO UPDATE SET version = search_document_refreshes.version + 1;
  ELSE
    -- A cascading merchant delete removes the queue row through its foreign key.
    INSERT INTO public.search_document_refreshes (merchant_id)
      SELECT merchant.id FROM public.merchants AS merchant
      WHERE merchant.id IN (
        CASE WHEN TG_OP <> 'DELETE' THEN NEW.merchant_id END,
        CASE WHEN TG_OP <> 'INSERT' THEN OLD.merchant_id END
      )
      ORDER BY merchant.id
      ON CONFLICT (merchant_id) DO UPDATE SET version = search_document_refreshes.version + 1;
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER merchants_queue_search_document_refresh
AFTER INSERT OR UPDATE OF restaurant_name, status, is_demo ON public.merchants
FOR EACH ROW EXECUTE FUNCTION public.queue_search_document_refresh();
--> statement-breakpoint
CREATE TRIGGER items_queue_search_document_refresh
AFTER INSERT OR DELETE OR UPDATE OF merchant_id, names, descriptions, archived_at, moderation_status
ON public.items
FOR EACH ROW EXECUTE FUNCTION public.queue_search_document_refresh();
--> statement-breakpoint
INSERT INTO public.search_document_refreshes (merchant_id) SELECT id FROM public.merchants;
