-- Loaded only by the isolated demo dev server. The normal seed remains hidden from public discovery.
CREATE FUNCTION pg_temp.demo_uuid(value text) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT
RETURN overlay(overlay(md5(value) placing '8' from 13) placing 'a' from 17)::uuid;

CREATE TEMP TABLE demo_restaurants ON COMMIT DROP AS
SELECT id AS source_id, pg_temp.demo_uuid('local-tour:' || slug) AS id, slug
FROM public.merchants WHERE is_demo AND status = 'approved';

INSERT INTO public.merchants
  (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines,
   rc_number, status, created_at, reviewed_at, menu_revision)
SELECT demo.id, 'tour-' || demo.slug, source.restaurant_name, source.owner_name,
  '+213500000002', source.commune_id, source.location, source.cuisines, 'DEMO-ALGER',
  'active', now(), now(), 1
FROM demo_restaurants AS demo JOIN public.merchants AS source ON source.id = demo.source_id
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.merchant_members
WHERE user_id = '12e50205-d127-47b4-971f-55e0ec100002'
  AND merchant_id IN (SELECT source_id FROM demo_restaurants);

INSERT INTO public.merchant_members (merchant_id, user_id, role)
SELECT id, '12e50205-d127-47b4-971f-55e0ec100002', 'owner' FROM demo_restaurants
ON CONFLICT (merchant_id, user_id) DO NOTHING;

INSERT INTO public.media_uploads
  (id, owner_id, merchant_id, kind, content_type, bytes, status, quarantine_key, content_digest,
   created_at, adopted_at, reservation_session_id, preview_key, preview_width, preview_height,
   crop_focal_x, crop_focal_y, crop_zoom_percent, ready_variants, thumbhash)
SELECT pg_temp.demo_uuid('local-tour:' || photo.kind || ':' || demo.slug),
  source.owner_id, demo.id, photo.kind, source.content_type, source.bytes, source.status,
  'local-tour/quarantine/' || photo.kind || '/' || demo.slug, source.content_digest,
  source.created_at, source.adopted_at, source.reservation_session_id,
  'local-tour/preview/' || photo.kind || '/' || demo.slug, source.preview_width, source.preview_height,
  source.crop_focal_x, source.crop_focal_y, source.crop_zoom_percent,
  coalesce(asset.variants, source.ready_variants), coalesce(asset.thumbhash, source.thumbhash)
FROM demo_restaurants AS demo
JOIN public.media_uploads AS source ON source.merchant_id = demo.source_id AND source.kind = 'item'
JOIN public.merchants AS original ON original.id = demo.source_id
CROSS JOIN (VALUES ('cover'), ('logo'), ('item')) AS photo(kind)
LEFT JOIN demo_photo_assets AS asset ON asset.cuisine = original.cuisines[1] AND asset.kind = photo.kind
ON CONFLICT (id) DO NOTHING;

UPDATE public.merchants AS merchant
SET cover_photo_id = pg_temp.demo_uuid('local-tour:cover:' || demo.slug),
    logo_photo_id = pg_temp.demo_uuid('local-tour:logo:' || demo.slug)
FROM demo_restaurants AS demo
WHERE merchant.id = demo.id AND merchant.cover_photo_id IS NULL;

INSERT INTO public.categories (id, merchant_id, names, sort)
SELECT pg_temp.demo_uuid('local-tour:' || category.id), demo.id, category.names, category.sort
FROM public.categories AS category JOIN demo_restaurants AS demo ON demo.source_id = category.merchant_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.items
  (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min,
   moderation_status, photo_id)
SELECT pg_temp.demo_uuid('local-tour:' || item.id), demo.id, pg_temp.demo_uuid('local-tour:' || item.category_id),
  item.names, item.descriptions, item.price_dzd, item.tags, item.prep_extra_min, 'approved',
  pg_temp.demo_uuid('local-tour:item:' || demo.slug)
FROM public.items AS item JOIN demo_restaurants AS demo ON demo.source_id = item.merchant_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.option_groups (id, merchant_id, names, minimum, maximum)
SELECT pg_temp.demo_uuid('local-tour:size:' || slug), id, '{"fr":"Portion","ar":"الحجم"}', 1, 1
FROM demo_restaurants ON CONFLICT (id) DO NOTHING;

INSERT INTO public.options (id, merchant_id, group_id, names, price_delta_dzd, is_default, is_available, sort)
SELECT pg_temp.demo_uuid('local-tour:size:' || demo.slug || ':' || option.sort), demo.id,
  pg_temp.demo_uuid('local-tour:size:' || demo.slug), option.names::jsonb, option.price, option.sort = 0, true, option.sort
FROM demo_restaurants AS demo
CROSS JOIN (VALUES (0, '{"fr":"Classique","ar":"عادي"}', 0), (1, '{"fr":"Grande","ar":"كبير"}', 150))
  AS option(sort, names, price)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.item_option_groups (merchant_id, item_id, group_id, sort)
SELECT demo.id, item.id, pg_temp.demo_uuid('local-tour:size:' || demo.slug), 0
FROM demo_restaurants AS demo JOIN public.items AS item ON item.merchant_id = demo.id
JOIN public.categories AS category ON category.id = item.category_id
WHERE category.sort = 0 AND item.moderation_status = 'approved'
ON CONFLICT (merchant_id, item_id, group_id) DO NOTHING;

INSERT INTO public.merchant_hours (merchant_id, weekday, opens_minute, closes_minute)
SELECT id, day, 660, 1380 FROM demo_restaurants CROSS JOIN generate_series(0, 6) AS day
ON CONFLICT DO NOTHING;

INSERT INTO public.merchant_ramadan_schedules
  (merchant_id, weekly, suhoor_opens_minute, suhoor_closes_minute, method, adjustment_minutes)
SELECT id, (SELECT jsonb_agg(jsonb_build_object('weekday', day, 'ranges',
  '[{"opens":{"kind":"maghrib","minutes":-20},"closes":{"kind":"clock","minuteOfDay":1410}}]'::jsonb)
  ORDER BY day) FROM generate_series(0, 6) AS day), 180, 300, 'Algeria', 0
FROM demo_restaurants ON CONFLICT (merchant_id) DO NOTHING;

INSERT INTO public.promotions (id, merchant_id, code, discount, conditions, created_at, updated_at)
SELECT pg_temp.demo_uuid('local-tour:promo:' || slug), id, 'SAFRAN15',
  '{"kind":"percent","basisPoints":1500,"capDzd":500}', '{"minimumSubtotalDzd":850}', now(), now()
FROM demo_restaurants ON CONFLICT DO NOTHING;

INSERT INTO public.subscriptions
  (id, merchant_id, status, price_dzd, trial_ends_at, period_starts_at, period_ends_at, next_invoice_at)
SELECT pg_temp.demo_uuid('local-tour:sub:' || slug), id,
  CASE WHEN slug = 'demo-lune-de-semoule' THEN 'past_due'
       WHEN slug IN ('demo-ficelle-du-four', 'demo-mie-des-figues') THEN 'trialing' ELSE 'active' END,
  5000, date_trunc('month', now()) + interval '1 month',
  date_trunc('month', now()), date_trunc('month', now()) + interval '1 month',
  date_trunc('month', now()) + interval '1 month'
FROM demo_restaurants ON CONFLICT (merchant_id) DO NOTHING;

INSERT INTO public.invoices
  (id, merchant_id, subscription_id, number, status, period_starts_at, period_ends_at,
   issued_at, due_at, subtotal_dzd, tax_rate_basis_points, tax_dzd, total_dzd)
SELECT pg_temp.demo_uuid('local-tour:invoice:' || demo.slug || ':' || month.month_index), demo.id, subscription.id,
  '2099-' || lpad((990000 + (row_number() OVER (ORDER BY demo.slug, month.month_index)))::text, 6, '0'),
  CASE WHEN month.month_index = 2 THEN 'paid' ELSE 'issued' END,
  date_trunc('month', now()) - make_interval(months => month.month_index),
  date_trunc('month', now()) - make_interval(months => month.month_index - 1),
  date_trunc('month', now()) - make_interval(months => month.month_index),
  date_trunc('month', now()) - make_interval(months => month.month_index) + interval '7 days',
  5000, 0, 0, 5000
FROM demo_restaurants AS demo
JOIN public.subscriptions AS subscription ON subscription.merchant_id = demo.id
CROSS JOIN (VALUES (1), (2)) AS month(month_index)
WHERE subscription.status <> 'trialing'
ON CONFLICT DO NOTHING;

INSERT INTO public.merchants
  (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location, cuisines,
   status, created_at, is_demo)
SELECT pg_temp.demo_uuid('local-tour:application:' || demo.slug), 'tour-application-' || demo.slug,
  CASE demo.slug WHEN 'demo-lune-de-semoule' THEN 'Maison de la Coriandre' ELSE 'Les Dattes Dorées' END,
  'Compte de démonstration', '+213500000002', source.commune_id, source.location, source.cuisines,
  'pending_review', now(), true
FROM demo_restaurants AS demo JOIN public.merchants AS source ON source.id = demo.source_id
WHERE demo.slug IN ('demo-lune-de-semoule', 'demo-ficelle-du-four')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.items
  (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min,
   moderation_status, photo_id)
SELECT pg_temp.demo_uuid('local-tour:pending:' || demo.slug), demo.id, category.id,
  '{"fr":"Assiette du marché","ar":"طبق السوق"}',
  '{"fr":"Nouvelle recette proposée par le chef.","ar":"وصفة جديدة يقترحها الشيف."}',
  850, '{}', 5, 'blocked_pending_review', pg_temp.demo_uuid('local-tour:item:' || demo.slug)
FROM demo_restaurants AS demo JOIN public.categories AS category ON category.merchant_id = demo.id
WHERE category.sort = 0 AND demo.slug IN ('demo-lune-de-semoule', 'demo-ficelle-du-four')
ON CONFLICT (id) DO NOTHING;

-- Complete the featured restaurant's public menu without changing existing dish IDs.
INSERT INTO public.categories (id, merchant_id, names, sort)
SELECT pg_temp.demo_uuid('local-tour:featured:' || category.sort), demo.id,
  jsonb_build_object('fr', category.fr, 'ar', category.ar), category.sort
FROM demo_restaurants AS demo
CROSS JOIN (VALUES (2, 'À partager', 'للمشاركة'), (3, 'Boissons maison', 'مشروبات الدار'))
  AS category(sort, fr, ar)
WHERE demo.slug = 'demo-lune-de-semoule'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.items
  (id, merchant_id, category_id, names, descriptions, price_dzd, tags, prep_extra_min,
   is_available, moderation_status, photo_id)
SELECT pg_temp.demo_uuid('local-tour:featured:' || dish.fr), demo.id, category.id,
  jsonb_build_object('fr', dish.fr, 'ar', dish.ar),
  jsonb_build_object('fr', dish.detail_fr, 'ar', dish.detail_ar),
  dish.price, CASE WHEN dish.popular THEN ARRAY['popular'] ELSE ARRAY[]::text[] END,
  5, dish.available, 'approved', pg_temp.demo_uuid('local-tour:item:' || demo.slug)
FROM demo_restaurants AS demo
JOIN public.categories AS category ON category.merchant_id = demo.id
JOIN (VALUES
  (0, 'Tajine de poulet', 'طاجين الدجاج', 'Citron confit et olives', 'ليمون مصبّر وزيتون', 1150, true, true),
  (0, 'Rechta de la Casbah', 'رشتة القصبة', 'Nouilles fraîches et sauce blanche', 'رشتة طازجة وصلصة بيضاء', 1050, false, true),
  (1, 'Kalb el louz', 'قلب اللوز', 'Semoule et fleur d’oranger', 'سميد وزهر البرتقال', 280, true, true),
  (1, 'Mhalbi à la cannelle', 'محلبي بالقرفة', 'Crème de riz et cannelle', 'كريمة الأرز والقرفة', 320, false, true),
  (1, 'Makrout aux dattes', 'مقروط بالتمر', 'Semoule dorée et pâte de dattes', 'سميد ذهبي وعجينة تمر', 280, false, false),
  (2, 'Salade méchouia', 'سلطة مشوية', 'Poivrons grillés et huile d’olive', 'فلفل مشوي وزيت الزيتون', 490, true, true),
  (2, 'Maakouda maison', 'معقودة الدار', 'Galettes de pommes de terre', 'أقراص بطاطا', 360, false, true),
  (2, 'Houmous au cumin', 'حمص بالكمون', 'Pois chiches et cumin torréfié', 'حمص وكمون محمّص', 420, false, true),
  (2, 'Poivrons farcis', 'فلفل محشي', 'Farce aux herbes et au riz', 'حشوة الأعشاب والأرز', 590, false, false),
  (2, 'Pain matlouh', 'مطلوع الدار', 'Pain de semoule à la poêle', 'خبز السميد على الطاجين', 220, false, true),
  (3, 'Citronnade au gingembre', 'ليمونادة بالزنجبيل', 'Citron pressé et gingembre frais', 'ليمون معصور وزنجبيل طازج', 320, true, true),
  (3, 'Thé glacé à la menthe', 'شاي مثلّج بالنعناع', 'Thé vert et menthe fraîche', 'شاي أخضر ونعناع طازج', 290, false, true),
  (3, 'Jus d’orange pressé', 'عصير برتقال طازج', 'Oranges pressées à la commande', 'برتقال يُعصر عند الطلب', 350, false, true),
  (3, 'Lait aux dattes', 'حليب بالتمر', 'Dattes et lait frais', 'تمر وحليب طازج', 380, false, false),
  (3, 'Infusion à la verveine', 'تيزانة اللويزة', 'Verveine et zeste de citron', 'لويزة وقشر الليمون', 260, false, true)
) AS dish(sort, fr, ar, detail_fr, detail_ar, price, popular, available) ON dish.sort = category.sort
WHERE demo.slug = 'demo-lune-de-semoule'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.item_option_groups (merchant_id, item_id, group_id, sort)
SELECT demo.id, item.id, pg_temp.demo_uuid('local-tour:size:' || demo.slug), 0
FROM demo_restaurants AS demo JOIN public.items AS item ON item.merchant_id = demo.id
WHERE demo.slug = 'demo-lune-de-semoule' AND item.moderation_status = 'approved'
ON CONFLICT (merchant_id, item_id, group_id) DO NOTHING;
