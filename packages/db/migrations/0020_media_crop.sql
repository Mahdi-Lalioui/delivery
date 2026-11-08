CREATE FUNCTION public.media_ready_variants_valid(variants jsonb, media_kind text)
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN CASE
  WHEN jsonb_typeof(variants) <> 'array' THEN false
  ELSE (
    SELECT count(*) = 10 AND count(DISTINCT variant->>'key') = 10
      AND bool_and(
        jsonb_typeof(variant->'key') = 'string' AND btrim(variant->>'key') <> ''
        AND CASE WHEN jsonb_typeof(variant->'bytes') = 'number' THEN
          (variant->>'bytes')::numeric BETWEEN 1 AND 9007199254740991
          AND trunc((variant->>'bytes')::numeric) = (variant->>'bytes')::numeric
        ELSE false END
      )
    FROM jsonb_array_elements(variants) AS entry(variant)
  ) AND NOT EXISTS (
    SELECT FROM unnest(ARRAY[160, 320, 640, 960, 1280]) AS sizes(width)
    CROSS JOIN unnest(ARRAY['avif', 'webp']) AS formats(format)
    WHERE NOT variants @> jsonb_build_array(jsonb_build_object(
      'width', width,
      'height', CASE media_kind
        WHEN 'logo' THEN width
        WHEN 'item' THEN width * 3 / 4
        ELSE width * 9 / 16
      END,
      'format', format
    ))
  )
END;
--> statement-breakpoint
ALTER TABLE public.media_uploads
  -- Keep historical session provenance after session retention deletes expired sessions.
  ADD COLUMN reservation_session_id uuid,
  ADD COLUMN crop_focal_x integer CHECK (crop_focal_x BETWEEN 0 AND 10000),
  ADD COLUMN crop_focal_y integer CHECK (crop_focal_y BETWEEN 0 AND 10000),
  ADD COLUMN crop_zoom_percent integer CHECK (crop_zoom_percent BETWEEN 100 AND 400),
  ADD COLUMN ready_variants jsonb,
  ADD COLUMN thumbhash text CHECK (
    length(thumbhash) BETWEEN 8 AND 64
    AND thumbhash ~ '^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'
  ),
  DROP CONSTRAINT media_upload_adoption_check,
  DROP CONSTRAINT media_upload_preparation_check,
  ADD CONSTRAINT media_upload_adoption_check CHECK (
    (status = 'awaiting_upload' AND quarantine_key IS NULL AND content_digest IS NULL AND adopted_at IS NULL)
    OR
    (status IN ('preparing', 'awaiting_crop', 'rejected', 'processing', 'ready') AND quarantine_key IS NOT NULL
      AND content_digest IS NOT NULL AND adopted_at IS NOT NULL)
  ),
  ADD CONSTRAINT media_upload_preparation_check CHECK (
    (preview_key IS NOT NULL) = (status IN ('awaiting_crop', 'processing', 'ready'))
    AND (preview_width IS NOT NULL) = (status IN ('awaiting_crop', 'processing', 'ready'))
    AND (preview_height IS NOT NULL) = (status IN ('awaiting_crop', 'processing', 'ready'))
    AND (rejection_reason IS NOT NULL) = (status = 'rejected')
  ),
  ADD CONSTRAINT media_upload_crop_check CHECK (
    (status NOT IN ('processing', 'ready') OR reservation_session_id IS NOT NULL)
    AND (crop_focal_x IS NOT NULL) = (status IN ('processing', 'ready'))
    AND (crop_focal_y IS NOT NULL) = (status IN ('processing', 'ready'))
    AND (crop_zoom_percent IS NOT NULL) = (status IN ('processing', 'ready'))
  ),
  ADD CONSTRAINT media_upload_ready_check CHECK (
    (ready_variants IS NOT NULL) = (status = 'ready')
    AND (thumbhash IS NOT NULL) = (status = 'ready')
    AND (ready_variants IS NULL OR public.media_ready_variants_valid(ready_variants, kind))
  );
--> statement-breakpoint
ALTER TABLE public.media_command_receipts
  DROP CONSTRAINT media_command_receipts_operation_check,
  ADD CONSTRAINT media_command_receipts_operation_check CHECK (operation IN ('reserve', 'crop'));
