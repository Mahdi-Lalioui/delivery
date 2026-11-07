CREATE TABLE public.merchant_hours (
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_minute smallint NOT NULL CHECK (opens_minute BETWEEN 0 AND 1439),
  closes_minute smallint NOT NULL CHECK (closes_minute BETWEEN 0 AND 1440),
  CHECK (opens_minute <> closes_minute),
  PRIMARY KEY (merchant_id, weekday, opens_minute, closes_minute)
);
--> statement-breakpoint
CREATE INDEX items_onboarding_eligible_merchant_idx ON public.items (merchant_id)
  WHERE archived_at IS NULL AND moderation_status IN ('approved', 'unreviewed');
