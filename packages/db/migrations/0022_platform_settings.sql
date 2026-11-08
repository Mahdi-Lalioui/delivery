CREATE TABLE public.platform_settings (
  key text PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 128 AND btrim(key) = key),
  value jsonb NOT NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE public.feature_flags (
  key text PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 128 AND btrim(key) = key),
  is_enabled boolean NOT NULL DEFAULT false,
  scope jsonb CHECK (scope IS NULL OR jsonb_typeof(scope) = 'object'),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO public.feature_flags (key) VALUES
  ('menu_photo_import'), ('online_payments'), ('ramadan_mode'), ('subscription_online_payment');
