CREATE TABLE public.customer_favourites (
  customer_id uuid NOT NULL REFERENCES public.users(id),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (customer_id, merchant_id)
);
