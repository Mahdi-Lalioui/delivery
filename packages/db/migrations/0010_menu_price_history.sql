ALTER TABLE public.menu_command_receipts
  DROP CONSTRAINT menu_command_receipts_operation_check,
  ADD CONSTRAINT menu_command_receipts_operation_check CHECK (
    operation IN (
      'category_create', 'category_rename', 'category_reorder',
      'item_create', 'item_update', 'item_duplicate', 'item_archive', 'item_availability',
      'option_group_create', 'option_group_update', 'bulk_price_apply'
    )
  );
--> statement-breakpoint
CREATE TABLE public.price_change_batches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  applied_at timestamptz NOT NULL,
  undone_at timestamptz,
  CHECK (undone_at IS NULL OR undone_at >= applied_at),
  UNIQUE (merchant_id, id)
);
--> statement-breakpoint
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  item_id uuid NOT NULL,
  old_price_dzd integer NOT NULL CHECK (old_price_dzd >= 0),
  new_price_dzd integer NOT NULL CHECK (new_price_dzd >= 0),
  FOREIGN KEY (merchant_id, batch_id) REFERENCES public.price_change_batches (merchant_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (merchant_id, item_id) REFERENCES public.items (merchant_id, id) ON DELETE CASCADE,
  UNIQUE (batch_id, item_id)
);
--> statement-breakpoint
CREATE INDEX price_history_merchant_item_idx ON public.price_history (merchant_id, item_id, batch_id);
