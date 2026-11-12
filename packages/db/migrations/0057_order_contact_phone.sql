ALTER TABLE public.orders ADD COLUMN contact_phone_e164 text
  CHECK (contact_phone_e164 ~ '^\+213[567][0-9]{8}$');
