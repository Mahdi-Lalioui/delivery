ALTER TABLE public.sessions ADD UNIQUE (id, user_id);
--> statement-breakpoint
CREATE TABLE public.push_subscriptions (
  endpoint text PRIMARY KEY CHECK (char_length(endpoint) BETWEEN 1 AND 2048),
  user_id uuid NOT NULL REFERENCES public.users(id),
  session_id uuid NOT NULL,
  p256dh text NOT NULL CHECK (char_length(p256dh) = 87),
  auth_key text NOT NULL CHECK (char_length(auth_key) = 22),
  expires_ms bigint CHECK (expires_ms >= 0),
  FOREIGN KEY (session_id, user_id) REFERENCES public.sessions(id, user_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);
--> statement-breakpoint
CREATE INDEX push_subscriptions_session_idx ON public.push_subscriptions (session_id);
