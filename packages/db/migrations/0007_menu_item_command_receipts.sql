ALTER TABLE public.menu_command_receipts
  DROP CONSTRAINT menu_command_receipts_operation_check,
  ADD CONSTRAINT menu_command_receipts_operation_check CHECK (
    operation IN (
      'category_create', 'category_rename', 'category_reorder',
      'item_create', 'item_update', 'item_duplicate', 'item_archive', 'item_availability'
    )
  );
--> statement-breakpoint
CREATE INDEX items_active_merchant_category_id_idx
  ON public.items (merchant_id, category_id, id)
  WHERE archived_at IS NULL;
