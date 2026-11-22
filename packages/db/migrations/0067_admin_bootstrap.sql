CREATE TABLE public.admin_bootstrap_audit (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  operator text NOT NULL CHECK (operator ~ '^[a-zA-Z0-9_.@-]{1,80}$'),
  forced boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'awid_runtime') THEN
    REVOKE ALL ON public.admin_bootstrap_audit FROM awid_runtime;
    REVOKE INSERT, UPDATE, DELETE ON public.admins FROM awid_runtime;
    GRANT UPDATE (last_totp_step) ON public.admins TO awid_runtime;
  END IF;
END
$$;
