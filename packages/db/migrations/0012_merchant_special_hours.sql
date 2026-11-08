ALTER TABLE public.menu_command_receipts
  DROP CONSTRAINT menu_command_receipts_operation_check,
  ADD CONSTRAINT menu_command_receipts_operation_check CHECK (
    operation IN (
      'category_create', 'category_rename', 'category_reorder',
      'item_create', 'item_update', 'item_duplicate', 'item_archive', 'item_availability',
      'option_group_create', 'option_group_update', 'bulk_price_apply', 'bulk_price_undo',
      'hours_replace'
    )
  );
--> statement-breakpoint
CREATE TABLE public.merchant_special_dates (
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  PRIMARY KEY (merchant_id, local_date)
);
--> statement-breakpoint
CREATE TABLE public.merchant_special_hours (
  merchant_id uuid NOT NULL,
  local_date date NOT NULL,
  opens_minute smallint NOT NULL CHECK (opens_minute BETWEEN 0 AND 1439),
  closes_minute smallint NOT NULL CHECK (closes_minute BETWEEN 0 AND 1440),
  CHECK (opens_minute <> closes_minute),
  PRIMARY KEY (merchant_id, local_date, opens_minute, closes_minute),
  FOREIGN KEY (merchant_id, local_date)
    REFERENCES public.merchant_special_dates (merchant_id, local_date) ON DELETE CASCADE
);
