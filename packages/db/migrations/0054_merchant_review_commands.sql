CREATE TABLE public.rating_replies (
  rating_id uuid PRIMARY KEY REFERENCES public.ratings(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at >= created_at)
);
--> statement-breakpoint
CREATE TABLE public.rating_reports (
  rating_id uuid PRIMARY KEY REFERENCES public.ratings(id),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  reported_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE INDEX rating_reports_recent_idx ON public.rating_reports (reported_at DESC, rating_id DESC);
--> statement-breakpoint
CREATE TABLE public.merchant_review_receipts (
  account_id uuid NOT NULL REFERENCES public.users(id),
  rating_id uuid NOT NULL REFERENCES public.ratings(id),
  operation text NOT NULL CHECK (operation IN ('reply', 'report')),
  key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, rating_id, operation, key_hash)
);
--> statement-breakpoint
CREATE INDEX merchant_review_receipts_expiry_idx ON public.merchant_review_receipts (expires_at);
