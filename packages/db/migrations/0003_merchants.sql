CREATE TABLE public.wilayas (
  code smallint PRIMARY KEY CHECK (code BETWEEN 1 AND 69),
  name_ar text NOT NULL CHECK (btrim(name_ar) <> ''),
  name_fr text NOT NULL CHECK (btrim(name_fr) <> '')
);
--> statement-breakpoint
CREATE TABLE public.communes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[0-9]{4}$'),
  wilaya_code smallint NOT NULL REFERENCES public.wilayas(code),
  name_ar text NOT NULL CHECK (btrim(name_ar) <> ''),
  name_fr text NOT NULL CHECK (btrim(name_fr) <> ''),
  centroid geography(Point, 4326) NOT NULL,
  boundary geometry(MultiPolygon, 4326),
  CHECK (boundary IS NULL OR (NOT ST_IsEmpty(boundary) AND ST_IsValid(boundary)))
);
--> statement-breakpoint
CREATE INDEX communes_wilaya_code_idx ON public.communes (wilaya_code, code);
--> statement-breakpoint
CREATE TABLE public.merchants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  slug text NOT NULL UNIQUE CHECK (btrim(slug) <> ''),
  restaurant_name text NOT NULL CHECK (char_length(btrim(restaurant_name)) BETWEEN 1 AND 120),
  owner_name text NOT NULL CHECK (char_length(btrim(owner_name)) BETWEEN 1 AND 120),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+213[567][0-9]{8}$'),
  commune_id uuid NOT NULL REFERENCES public.communes(id),
  location geography(Point, 4326) NOT NULL,
  cuisines text[] NOT NULL CHECK (cardinality(cuisines) BETWEEN 1 AND 5),
  rc_number text CHECK (char_length(btrim(rc_number)) BETWEEN 1 AND 64),
  status text NOT NULL CHECK (status IN ('pending_review', 'approved', 'rejected', 'active', 'paused', 'suspended')),
  created_at timestamptz(3) NOT NULL,
  reviewed_at timestamptz(3) CHECK (reviewed_at >= created_at),
  is_demo boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE INDEX merchants_review_queue_idx ON public.merchants (created_at, id) WHERE status = 'pending_review';
--> statement-breakpoint
CREATE INDEX merchants_commune_id_idx ON public.merchants (commune_id);
--> statement-breakpoint
CREATE TABLE public.merchant_members (
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  PRIMARY KEY (merchant_id, user_id)
);
--> statement-breakpoint
CREATE INDEX merchant_members_user_idx ON public.merchant_members (user_id, merchant_id);
--> statement-breakpoint
CREATE TABLE public.merchant_review_notices (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  action text NOT NULL CHECK (btrim(action) <> ''),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX audit_log_merchant_time_idx ON public.audit_log (merchant_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE public.merchant_command_receipts (
  actor_id uuid NOT NULL REFERENCES public.users(id),
  operation text NOT NULL CHECK (operation IN ('application', 'review')),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  result_status text NOT NULL,
  recorded_at timestamptz NOT NULL,
  CHECK (
    (operation = 'application' AND result_status = 'pending_review')
    OR (operation = 'review' AND result_status IN ('approved', 'rejected'))
  ),
  PRIMARY KEY (actor_id, operation, key_hash)
);
--> statement-breakpoint
CREATE INDEX merchant_receipts_merchant_idx ON public.merchant_command_receipts (merchant_id);
