CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  location geography(Point, 4326) NOT NULL,
  plus_code text NOT NULL CHECK (plus_code ~ '^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2}$'),
  commune_id uuid REFERENCES public.communes(id),
  building text CHECK (char_length(btrim(building)) BETWEEN 1 AND 120),
  floor text CHECK (char_length(btrim(floor)) BETWEEN 1 AND 32),
  apartment text CHECK (char_length(btrim(apartment)) BETWEEN 1 AND 32),
  landmark text CHECK (char_length(btrim(landmark)) BETWEEN 1 AND 160),
  instructions text CHECK (char_length(btrim(instructions)) BETWEEN 1 AND 500),
  is_default boolean NOT NULL
);
--> statement-breakpoint
CREATE INDEX addresses_user_idx ON public.addresses (user_id, id DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX addresses_default_idx ON public.addresses (user_id) WHERE is_default;
