ALTER TABLE public.merchant_order_settings ADD COLUMN price_level smallint CHECK (price_level BETWEEN 1 AND 3);
--> statement-breakpoint
CREATE TABLE public.ratings (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  food_stars smallint NOT NULL CHECK (food_stars BETWEEN 1 AND 5),
  delivery_stars smallint CHECK (delivery_stars BETWEEN 1 AND 5),
  comment text CHECK (char_length(comment) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX orders_rating_lookup_idx ON public.orders (merchant_id, id) WHERE status IN ('delivered', 'collected');
--> statement-breakpoint
CREATE INDEX merchants_public_cuisine_idx ON public.merchants USING gin (cuisines)
  WHERE status = 'active' AND NOT is_demo;
--> statement-breakpoint
CREATE FUNCTION public.feed_merchant_open(merchant uuid, at_time timestamptz, paused_until timestamptz)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  WITH clock AS (
    SELECT at_time AT TIME ZONE 'Africa/Algiers' AS local_time
  ), days AS (
    SELECT local_time::date - shift AS day, shift,
      extract(hour FROM local_time) * 60 + extract(minute FROM local_time) AS minute,
      EXISTS (SELECT FROM public.merchant_special_dates WHERE merchant_id = merchant AND local_date = local_time::date - shift) AS special
    FROM clock CROSS JOIN generate_series(0, 1) AS shifts(shift)
  ), spans AS (
    SELECT days.shift, days.minute, special.opens_minute, special.closes_minute
    FROM days JOIN public.merchant_special_hours AS special ON
      special.merchant_id = merchant AND special.local_date = days.day
    UNION ALL
    SELECT days.shift, days.minute, weekly.opens_minute, weekly.closes_minute
    FROM days JOIN public.merchant_hours AS weekly ON
      weekly.merchant_id = merchant AND weekly.weekday = extract(dow FROM days.day)
    WHERE NOT days.special
  )
  SELECT (paused_until IS NULL OR paused_until <= at_time) AND EXISTS (
    SELECT FROM spans
    WHERE (shift = 0 AND minute >= opens_minute AND (closes_minute < opens_minute OR minute < closes_minute))
       OR (shift = 1 AND closes_minute < opens_minute AND minute < closes_minute
           AND NOT (SELECT special FROM days WHERE shift = 0))
  )
$$;
