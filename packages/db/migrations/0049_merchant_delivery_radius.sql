ALTER TABLE public.delivery_zones
  ADD COLUMN merchant_managed boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT delivery_zones_merchant_managed_radius CHECK (NOT merchant_managed OR radius_m IS NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX delivery_zones_merchant_managed_idx ON public.delivery_zones (merchant_id)
  WHERE merchant_managed;
--> statement-breakpoint
ALTER TABLE public.menu_command_receipts
  DROP CONSTRAINT menu_command_receipts_operation_check,
  ADD CONSTRAINT menu_command_receipts_operation_check CHECK (
    operation IN (
      'category_create', 'category_rename', 'category_reorder',
      'item_create', 'item_update', 'item_duplicate', 'item_archive', 'item_availability',
      'option_group_create', 'option_group_update', 'bulk_price_apply', 'bulk_price_undo',
      'hours_replace', 'ramadan_replace', 'hours_pause', 'menu_import', 'profile_photos_replace',
      'delivery_settings_replace'
    )
  );
