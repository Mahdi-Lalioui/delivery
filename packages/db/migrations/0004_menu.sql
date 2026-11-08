ALTER TABLE public.merchants ADD COLUMN menu_revision bigint NOT NULL DEFAULT 0
  CHECK (menu_revision BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
CREATE FUNCTION public.menu_translations_valid(translations jsonb, max_length integer)
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(translations) = 'object'
    AND (translations ? 'ar' OR translations ? 'fr')
    AND NOT EXISTS (
      SELECT FROM jsonb_each(
        CASE WHEN jsonb_typeof(translations) = 'object' THEN translations ELSE '{}'::jsonb END
      ) AS translation
      WHERE translation.key NOT IN ('ar', 'fr', 'en')
        OR jsonb_typeof(translation.value) <> 'string'
        OR char_length(translation.value #>> '{}') > max_length
        OR (translation.value #>> '{}') !~ '[^[:space:]]'
    )
$$;
--> statement-breakpoint
CREATE FUNCTION public.menu_tags_valid(tags text[])
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(array_ndims(tags), 1) = 1
    AND cardinality(tags) <= 4
    AND tags <@ ARRAY['spicy', 'vegetarian', 'new', 'popular']::text[]
    AND cardinality(tags) = (SELECT count(DISTINCT tag) FROM unnest(tags) AS tag)
$$;
--> statement-breakpoint
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  names jsonb NOT NULL CHECK (public.menu_translations_valid(names, 120)),
  sort integer NOT NULL CHECK (sort >= 0),
  available_from time without time zone,
  available_to time without time zone,
  CHECK (
    (available_from IS NULL AND available_to IS NULL)
    OR (
      available_from IS NOT NULL AND available_to IS NOT NULL
      AND available_from < time '24:00' AND available_to < time '24:00'
      AND extract(second FROM available_from) = 0 AND extract(second FROM available_to) = 0
      AND available_from <> available_to
    )
  ),
  UNIQUE (merchant_id, id),
  CONSTRAINT categories_merchant_sort_key UNIQUE (merchant_id, sort) DEFERRABLE
);
--> statement-breakpoint
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL,
  names jsonb NOT NULL CHECK (public.menu_translations_valid(names, 120)),
  descriptions jsonb NOT NULL CHECK (public.menu_translations_valid(descriptions, 1000)),
  price_dzd integer NOT NULL CHECK (price_dzd >= 0),
  tags text[] NOT NULL CHECK (public.menu_tags_valid(tags)),
  prep_extra_min smallint NOT NULL CHECK (prep_extra_min BETWEEN 0 AND 120),
  is_available boolean NOT NULL DEFAULT true,
  sold_out_until timestamptz,
  archived_at timestamptz,
  moderation_status text NOT NULL DEFAULT 'unreviewed'
    CHECK (moderation_status IN ('unreviewed', 'approved', 'blocked_pending_review', 'rejected')),
  CHECK (NOT is_available OR sold_out_until IS NULL),
  UNIQUE (merchant_id, id),
  FOREIGN KEY (merchant_id, category_id) REFERENCES public.categories (merchant_id, id)
);
--> statement-breakpoint
CREATE INDEX items_merchant_category_id_idx ON public.items (merchant_id, category_id, id);
--> statement-breakpoint
CREATE TABLE public.option_groups (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  names jsonb NOT NULL CHECK (public.menu_translations_valid(names, 120)),
  minimum smallint NOT NULL CHECK (minimum >= 0),
  maximum smallint NOT NULL CHECK (maximum BETWEEN 1 AND 100),
  CHECK (minimum <= maximum),
  UNIQUE (merchant_id, id)
);
--> statement-breakpoint
CREATE TABLE public.options (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL,
  group_id uuid NOT NULL,
  names jsonb NOT NULL CHECK (public.menu_translations_valid(names, 120)),
  price_delta_dzd integer NOT NULL CHECK (price_delta_dzd >= 0),
  is_default boolean NOT NULL,
  is_available boolean NOT NULL,
  sort smallint NOT NULL CHECK (sort BETWEEN 0 AND 99),
  FOREIGN KEY (merchant_id, group_id) REFERENCES public.option_groups (merchant_id, id) ON DELETE CASCADE,
  CONSTRAINT options_group_sort_key UNIQUE (merchant_id, group_id, sort) DEFERRABLE
);
--> statement-breakpoint
CREATE TABLE public.item_option_groups (
  merchant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  group_id uuid NOT NULL,
  sort smallint NOT NULL CHECK (sort BETWEEN 0 AND 49),
  PRIMARY KEY (merchant_id, item_id, group_id),
  FOREIGN KEY (merchant_id, item_id) REFERENCES public.items (merchant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (merchant_id, group_id) REFERENCES public.option_groups (merchant_id, id) ON DELETE CASCADE,
  CONSTRAINT item_option_groups_item_sort_key UNIQUE (merchant_id, item_id, sort) DEFERRABLE
);
--> statement-breakpoint
CREATE INDEX item_option_groups_merchant_group_idx
  ON public.item_option_groups (merchant_id, group_id, item_id);
--> statement-breakpoint
CREATE FUNCTION public.queue_option_group_validation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  previous_merchant uuid;
  previous_group uuid;
  next_merchant uuid;
  next_group uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    previous_merchant := OLD.merchant_id;
    previous_group := OLD.group_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    next_merchant := NEW.merchant_id;
    next_group := NEW.group_id;
  END IF;
  IF TG_OP = 'UPDATE' AND (previous_merchant, previous_group) IS DISTINCT FROM (next_merchant, next_group) THEN
    PERFORM 1 FROM public.option_groups
      WHERE (merchant_id, id) IN ((previous_merchant, previous_group), (next_merchant, next_group))
      ORDER BY merchant_id, id FOR NO KEY UPDATE;
  END IF;

  -- Serialize concurrent option changes on the parent row and check the final group at commit.
  UPDATE public.option_groups SET maximum = maximum
    WHERE (merchant_id, id) IN ((previous_merchant, previous_group), (next_merchant, next_group));
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER options_queue_group_validation
AFTER INSERT OR UPDATE OF merchant_id, group_id, is_default OR DELETE ON public.options
FOR EACH ROW EXECUTE FUNCTION public.queue_option_group_validation();
--> statement-breakpoint
CREATE FUNCTION public.check_option_group_cardinality()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  current_maximum smallint;
  option_count bigint;
  default_count bigint;
BEGIN
  SELECT maximum INTO current_maximum FROM public.option_groups
    WHERE merchant_id = NEW.merchant_id AND id = NEW.id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT count(*), count(*) FILTER (WHERE is_default)
    INTO option_count, default_count FROM public.options
    WHERE merchant_id = NEW.merchant_id AND group_id = NEW.id;
  IF current_maximum > option_count OR current_maximum < default_count THEN
    RAISE EXCEPTION 'Option group limits do not match its options'
      USING ERRCODE = '23514', CONSTRAINT = 'option_groups_cardinality_check';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER option_groups_cardinality_check
AFTER INSERT OR UPDATE ON public.option_groups DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_option_group_cardinality();
