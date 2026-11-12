ALTER TABLE public.orders ADD COLUMN customer_locale text NOT NULL DEFAULT 'fr'
  CHECK (customer_locale IN ('ar', 'fr', 'en'));
