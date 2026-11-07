CREATE TABLE public.job_effects (
  task_identifier text NOT NULL,
  effect_key text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_identifier, effect_key)
);
