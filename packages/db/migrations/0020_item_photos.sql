ALTER TABLE public.media_uploads
  ADD CONSTRAINT media_uploads_merchant_id_id_key UNIQUE (merchant_id, id);
--> statement-breakpoint
ALTER TABLE public.items
  ADD COLUMN photo_media_id uuid,
  ADD CONSTRAINT items_photo_media_fkey FOREIGN KEY (merchant_id, photo_media_id)
    REFERENCES public.media_uploads (merchant_id, id) ON DELETE SET NULL (photo_media_id);
--> statement-breakpoint
CREATE INDEX items_photo_media_id_idx ON public.items (photo_media_id)
  WHERE photo_media_id IS NOT NULL;
