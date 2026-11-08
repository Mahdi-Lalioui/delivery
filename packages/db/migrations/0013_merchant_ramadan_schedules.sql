ALTER TABLE public.menu_command_receipts
  DROP CONSTRAINT menu_command_receipts_operation_check,
  ADD CONSTRAINT menu_command_receipts_operation_check CHECK (
    operation IN (
      'category_create', 'category_rename', 'category_reorder',
      'item_create', 'item_update', 'item_duplicate', 'item_archive', 'item_availability',
      'option_group_create', 'option_group_update', 'bulk_price_apply', 'bulk_price_undo',
      'hours_replace', 'ramadan_replace'
    )
  );
--> statement-breakpoint
CREATE TABLE public.merchant_ramadan_schedules (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  weekly jsonb NOT NULL CHECK (jsonb_typeof(weekly) = 'array' AND jsonb_array_length(weekly) = 7),
  suhoor_opens_minute smallint CHECK (suhoor_opens_minute BETWEEN 0 AND 1439),
  suhoor_closes_minute smallint CHECK (suhoor_closes_minute BETWEEN 0 AND 1440),
  method text NOT NULL CHECK (method IN (
    'Algeria', 'MuslimWorldLeague', 'Egyptian', 'Karachi', 'UmmAlQura', 'Dubai',
    'MoonsightingCommittee', 'NorthAmerica', 'Kuwait', 'Qatar', 'Singapore', 'Tehran', 'Turkey'
  )),
  adjustment_minutes smallint NOT NULL CHECK (adjustment_minutes BETWEEN -30 AND 30),
  CHECK ((suhoor_opens_minute IS NULL) = (suhoor_closes_minute IS NULL)),
  CHECK (suhoor_opens_minute IS DISTINCT FROM suhoor_closes_minute OR suhoor_opens_minute IS NULL)
);
