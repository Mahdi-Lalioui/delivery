CREATE INDEX merchants_public_feed_idx ON public.merchants (id)
  WHERE status = 'active' AND NOT is_demo;
