ALTER TABLE public.merchants
  ADD COLUMN cover_photo_id uuid,
  ADD COLUMN logo_photo_id uuid,
  ADD CONSTRAINT merchants_cover_photo_fk
    FOREIGN KEY (id, cover_photo_id) REFERENCES public.media_uploads (merchant_id, id),
  ADD CONSTRAINT merchants_logo_photo_fk
    FOREIGN KEY (id, logo_photo_id) REFERENCES public.media_uploads (merchant_id, id),
  ADD CONSTRAINT merchants_profile_photos_distinct_check
    CHECK (cover_photo_id IS NULL OR cover_photo_id IS DISTINCT FROM logo_photo_id);
--> statement-breakpoint
CREATE INDEX merchants_cover_photo_idx ON public.merchants (cover_photo_id) WHERE cover_photo_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX merchants_logo_photo_idx ON public.merchants (logo_photo_id) WHERE logo_photo_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE public.menu_command_receipts
  DROP CONSTRAINT menu_command_receipts_operation_check,
  ADD CONSTRAINT menu_command_receipts_operation_check CHECK (
    operation IN (
      'category_create', 'category_rename', 'category_reorder',
      'item_create', 'item_update', 'item_duplicate', 'item_archive', 'item_availability',
      'option_group_create', 'option_group_update', 'bulk_price_apply', 'bulk_price_undo',
      'hours_replace', 'ramadan_replace', 'hours_pause', 'menu_import', 'profile_photos_replace'
    )
  );
