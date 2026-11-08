ALTER TABLE public.items
  ADD COLUMN external_key text CHECK (external_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  ADD CONSTRAINT items_merchant_external_key UNIQUE (merchant_id, external_key);
--> statement-breakpoint
ALTER TABLE public.menu_command_receipts
  DROP CONSTRAINT menu_command_receipts_operation_check,
  ADD CONSTRAINT menu_command_receipts_operation_check CHECK (
    operation IN (
      'category_create', 'category_rename', 'category_reorder',
      'item_create', 'item_update', 'item_duplicate', 'item_archive', 'item_availability',
      'option_group_create', 'option_group_update', 'bulk_price_apply', 'bulk_price_undo',
      'hours_replace', 'ramadan_replace', 'hours_pause', 'menu_import'
    )
  );
