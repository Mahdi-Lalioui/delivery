CREATE TABLE public.billing_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  price_dzd integer NOT NULL DEFAULT 5000 CHECK (price_dzd > 0),
  trial_days smallint NOT NULL DEFAULT 30 CHECK (trial_days BETWEEN 0 AND 365),
  due_days smallint NOT NULL DEFAULT 7 CHECK (due_days BETWEEN 1 AND 365),
  grace_days smallint NOT NULL DEFAULT 7 CHECK (grace_days BETWEEN 0 AND 365),
  tax_rate_basis_points smallint NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points BETWEEN 0 AND 10000),
  company_name text CHECK (char_length(company_name) <= 200 AND btrim(company_name) <> ''),
  company_address text CHECK (char_length(company_address) <= 500 AND btrim(company_address) <> ''),
  registration_number text CHECK (char_length(registration_number) <= 120 AND btrim(registration_number) <> ''),
  tax_id text CHECK (char_length(tax_id) <= 120 AND btrim(tax_id) <> ''),
  subscription_online_payment_enabled boolean NOT NULL DEFAULT false,
  CHECK ((company_name IS NULL) = (company_address IS NULL)),
  CHECK (company_name IS NOT NULL OR (registration_number IS NULL AND tax_id IS NULL)),
  CHECK (price_dzd::bigint + (price_dzd::bigint * tax_rate_basis_points + 9999) / 10000 <= 2147483647)
);
--> statement-breakpoint
INSERT INTO public.billing_settings DEFAULT VALUES;
--> statement-breakpoint
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL UNIQUE REFERENCES public.merchants(id),
  status text NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  price_dzd integer NOT NULL CHECK (price_dzd > 0),
  trial_ends_at timestamptz,
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  next_invoice_at timestamptz,
  CHECK ((period_starts_at IS NULL) = (period_ends_at IS NULL)),
  CHECK (period_ends_at > period_starts_at),
  UNIQUE (merchant_id, id)
);
--> statement-breakpoint
CREATE INDEX subscriptions_status_next_invoice_idx ON public.subscriptions (status, next_invoice_at);
--> statement-breakpoint
CREATE INDEX subscriptions_status_id_idx ON public.subscriptions (status, id);
--> statement-breakpoint
CREATE TABLE public.invoice_sequences (
  year smallint PRIMARY KEY CHECK (year BETWEEN 1 AND 9999),
  last_value integer NOT NULL DEFAULT 0 CHECK (last_value BETWEEN 0 AND 999999)
);
--> statement-breakpoint
ALTER TABLE public.merchants ADD CONSTRAINT merchants_billing_demo_key UNIQUE (id, is_demo);
--> statement-breakpoint
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL,
  merchant_is_demo boolean GENERATED ALWAYS AS (false) STORED,
  subscription_id uuid NOT NULL,
  number text NOT NULL UNIQUE CHECK (number ~ '^[0-9]{4}-[0-9]{6}$'),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'void')),
  period_starts_at timestamptz NOT NULL,
  period_ends_at timestamptz NOT NULL CHECK (period_ends_at > period_starts_at),
  issued_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL CHECK (due_at > issued_at),
  subtotal_dzd integer NOT NULL CHECK (subtotal_dzd > 0),
  tax_rate_basis_points smallint NOT NULL CHECK (tax_rate_basis_points BETWEEN 0 AND 10000),
  tax_dzd integer NOT NULL CHECK (tax_dzd >= 0 AND (tax_rate_basis_points > 0 OR tax_dzd = 0)),
  total_dzd integer NOT NULL CHECK (total_dzd > 0 AND subtotal_dzd::bigint + tax_dzd = total_dzd),
  pdf_key text CHECK (btrim(pdf_key) <> ''),
  void_reason text CHECK (char_length(btrim(void_reason)) BETWEEN 1 AND 500),
  voided_at timestamptz CHECK (voided_at >= issued_at),
  CHECK ((status = 'void') = (void_reason IS NOT NULL)),
  CHECK ((status = 'void') = (voided_at IS NOT NULL)),
  UNIQUE (subscription_id, period_starts_at),
  UNIQUE (merchant_id, id),
  FOREIGN KEY (merchant_id, merchant_is_demo) REFERENCES public.merchants (id, is_demo),
  FOREIGN KEY (merchant_id, subscription_id) REFERENCES public.subscriptions (merchant_id, id)
);
--> statement-breakpoint
CREATE INDEX invoices_status_id_idx ON public.invoices (status, id);
--> statement-breakpoint
CREATE TABLE public.invoice_reminders (
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  day smallint NOT NULL CHECK (day IN (0, 5, 7, 12)),
  sent_at timestamptz NOT NULL,
  PRIMARY KEY (invoice_id, day)
);
--> statement-breakpoint
CREATE TABLE public.billing_proof_media (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  uploader_id uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'awaiting_upload' CHECK (status IN ('awaiting_upload', 'preparing', 'ready', 'rejected')),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/heic', 'image/webp')),
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 8388608),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  quarantine_key text UNIQUE CHECK (btrim(quarantine_key) <> ''),
  content_digest bytea CHECK (octet_length(content_digest) = 32),
  ready_key text UNIQUE CHECK (btrim(ready_key) <> ''),
  ready_content_type text CHECK (ready_content_type IN ('image/jpeg', 'image/png', 'image/heic', 'image/webp')),
  ready_bytes integer CHECK (ready_bytes BETWEEN 1 AND 8388608),
  rejection_reason text CHECK (rejection_reason IN ('upload_expired', 'content_type_mismatch', 'invalid_image', 'image_too_large')),
  CHECK ((quarantine_key IS NULL) = (content_digest IS NULL)),
  CHECK (status <> 'awaiting_upload' OR quarantine_key IS NULL),
  CHECK (status <> 'preparing' OR quarantine_key IS NOT NULL),
  CHECK ((status = 'ready') = (ready_key IS NOT NULL)),
  CHECK ((status = 'ready') = (ready_content_type IS NOT NULL)),
  CHECK ((status = 'ready') = (ready_bytes IS NOT NULL)),
  CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL)),
  UNIQUE (merchant_id, invoice_id, id, status),
  FOREIGN KEY (merchant_id, invoice_id) REFERENCES public.invoices (merchant_id, id)
);
--> statement-breakpoint
CREATE INDEX billing_proof_media_uploader_idx ON public.billing_proof_media (uploader_id);
--> statement-breakpoint
CREATE TABLE public.billing_transfer_proofs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  proof_media_id uuid NOT NULL,
  proof_media_status text GENERATED ALWAYS AS ('ready') STORED,
  method text NOT NULL CHECK (method IN ('ccp', 'baridimob')),
  reference text NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation', 'confirmed', 'rejected')),
  submitted_at timestamptz NOT NULL,
  resolved_at timestamptz CHECK (resolved_at >= submitted_at),
  CHECK ((status = 'pending_confirmation') = (resolved_at IS NULL)),
  UNIQUE (merchant_id, invoice_id, id),
  FOREIGN KEY (merchant_id, invoice_id, proof_media_id, proof_media_status)
    REFERENCES public.billing_proof_media (merchant_id, invoice_id, id, status)
);
--> statement-breakpoint
CREATE INDEX billing_transfer_proofs_media_idx ON public.billing_transfer_proofs (proof_media_id);
--> statement-breakpoint
CREATE INDEX billing_transfer_proofs_pending_idx ON public.billing_transfer_proofs (id)
  WHERE status = 'pending_confirmation';
--> statement-breakpoint
CREATE INDEX billing_transfer_proofs_pending_invoice_idx ON public.billing_transfer_proofs (invoice_id, id)
  WHERE status = 'pending_confirmation';
--> statement-breakpoint
CREATE TABLE public.billing_payments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  merchant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  proof_media_id uuid,
  proof_media_status text GENERATED ALWAYS AS ('ready') STORED,
  transfer_proof_id uuid,
  method text NOT NULL CHECK (method IN ('cash', 'ccp', 'baridimob', 'chargily')),
  reference text NOT NULL CHECK (char_length(btrim(reference)) BETWEEN 1 AND 120),
  amount_dzd integer NOT NULL CHECK (amount_dzd > 0),
  provider_event_id text UNIQUE CHECK (provider_event_id IS NULL OR (btrim(provider_event_id) <> '' AND method = 'chargily')),
  confirmed_at timestamptz NOT NULL,
  CHECK (proof_media_id IS NOT NULL OR provider_event_id IS NOT NULL),
  CHECK (transfer_proof_id IS NULL OR (proof_media_id IS NOT NULL AND method IN ('ccp', 'baridimob'))),
  FOREIGN KEY (merchant_id, invoice_id) REFERENCES public.invoices (merchant_id, id),
  FOREIGN KEY (merchant_id, invoice_id, proof_media_id, proof_media_status)
    REFERENCES public.billing_proof_media (merchant_id, invoice_id, id, status),
  FOREIGN KEY (merchant_id, invoice_id, transfer_proof_id)
    REFERENCES public.billing_transfer_proofs (merchant_id, invoice_id, id)
);
--> statement-breakpoint
CREATE INDEX billing_payments_invoice_idx ON public.billing_payments (merchant_id, invoice_id);
--> statement-breakpoint
CREATE INDEX billing_payments_media_idx ON public.billing_payments (proof_media_id) WHERE proof_media_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX billing_payments_transfer_idx ON public.billing_payments (transfer_proof_id) WHERE transfer_proof_id IS NOT NULL;
