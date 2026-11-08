CREATE INDEX platform_settings_updated_by_idx ON public.platform_settings (updated_by)
  WHERE updated_by IS NOT NULL;
--> statement-breakpoint
CREATE INDEX feature_flags_updated_by_idx ON public.feature_flags (updated_by)
  WHERE updated_by IS NOT NULL;
