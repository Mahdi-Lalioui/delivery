CREATE TABLE public.merchant_application_photos (
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.media_uploads(id),
  sort smallint NOT NULL CHECK (sort BETWEEN 0 AND 4),
  PRIMARY KEY (merchant_id, media_id),
  UNIQUE (merchant_id, sort)
);
--> statement-breakpoint
CREATE INDEX merchant_application_photos_media_idx ON public.merchant_application_photos (media_id);
--> statement-breakpoint
ALTER TABLE public.media_uploads ADD UNIQUE (merchant_id, id);
--> statement-breakpoint
ALTER TABLE public.items
  ADD COLUMN photo_id uuid,
  ADD CONSTRAINT items_merchant_photo_fk
    FOREIGN KEY (merchant_id, photo_id) REFERENCES public.media_uploads (merchant_id, id);
--> statement-breakpoint
CREATE INDEX items_merchant_photo_idx ON public.items (merchant_id, photo_id) WHERE photo_id IS NOT NULL;
