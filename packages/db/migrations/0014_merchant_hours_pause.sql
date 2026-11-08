ALTER TABLE public.menu_command_receipts
  DROP CONSTRAINT menu_command_receipts_operation_check,
  ADD CONSTRAINT menu_command_receipts_operation_check CHECK (
    operation IN (
      'category_create', 'category_rename', 'category_reorder',
      'item_create', 'item_update', 'item_duplicate', 'item_archive', 'item_availability',
      'option_group_create', 'option_group_update', 'bulk_price_apply', 'bulk_price_undo',
      'hours_replace', 'ramadan_replace', 'hours_pause'
    )
  );
--> statement-breakpoint
ALTER TABLE public.merchants ADD COLUMN hours_paused_until timestamptz;
