ALTER TABLE public.orders
  ADD COLUMN discount_dzd integer NOT NULL DEFAULT 0 CHECK (discount_dzd BETWEEN 0 AND subtotal_dzd),
  DROP CONSTRAINT orders_check1,
  ADD CONSTRAINT orders_total_dzd_check
    CHECK (total_dzd = subtotal_dzd::bigint - discount_dzd + delivery_fee_dzd);
