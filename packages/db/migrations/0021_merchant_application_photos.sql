CREATE TABLE public.merchant_application_photos (
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  media_id uuid NOT NULL UNIQUE REFERENCES public.media_uploads(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 4),
  PRIMARY KEY (merchant_id, position)
);
