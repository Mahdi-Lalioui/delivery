ALTER TABLE public.media_uploads
  ADD COLUMN preview_key text UNIQUE CHECK (btrim(preview_key) <> ''),
  ADD COLUMN preview_width integer CHECK (preview_width BETWEEN 1 AND 1280),
  ADD COLUMN preview_height integer CHECK (preview_height BETWEEN 1 AND 1280),
  ADD COLUMN crop_focal_x integer CHECK (crop_focal_x BETWEEN 0 AND 10000),
  ADD COLUMN crop_focal_y integer CHECK (crop_focal_y BETWEEN 0 AND 10000),
  ADD COLUMN crop_zoom_percent integer CHECK (crop_zoom_percent BETWEEN 100 AND 400),
  ADD COLUMN thumbhash text CHECK (thumbhash ~ '^[A-Za-z0-9+/]{6,64}={0,2}$'),
  ADD COLUMN rejection_reason text CHECK (
    rejection_reason IN ('content_type_mismatch', 'invalid_image', 'image_too_large')
  ),
  ADD CONSTRAINT media_upload_preview_check CHECK (
    num_nulls(preview_key, preview_width, preview_height) IN (0, 3)
  ),
  ADD CONSTRAINT media_upload_crop_check CHECK (
    num_nulls(crop_focal_x, crop_focal_y, crop_zoom_percent) IN (0, 3)
  ),
  DROP CONSTRAINT media_upload_adoption_check,
  ADD CONSTRAINT media_upload_adoption_check CHECK (
    (status = 'awaiting_upload' AND quarantine_key IS NULL AND content_digest IS NULL
      AND adopted_at IS NULL AND preview_key IS NULL AND crop_zoom_percent IS NULL
      AND thumbhash IS NULL AND rejection_reason IS NULL)
    OR
    (status IN ('preparing', 'awaiting_crop', 'processing', 'ready', 'rejected')
      AND quarantine_key IS NOT NULL AND content_digest IS NOT NULL AND adopted_at IS NOT NULL)
  ),
  ADD CONSTRAINT media_upload_state_check CHECK (
    CASE status
      WHEN 'awaiting_upload' THEN true
      WHEN 'preparing' THEN num_nonnulls(preview_key, crop_zoom_percent, thumbhash, rejection_reason) = 0
      WHEN 'awaiting_crop' THEN preview_key IS NOT NULL
        AND num_nonnulls(crop_zoom_percent, thumbhash, rejection_reason) = 0
      WHEN 'processing' THEN preview_key IS NOT NULL AND crop_zoom_percent IS NOT NULL
        AND num_nonnulls(thumbhash, rejection_reason) = 0
      WHEN 'ready' THEN preview_key IS NOT NULL AND crop_zoom_percent IS NOT NULL
        AND thumbhash IS NOT NULL AND rejection_reason IS NULL
      WHEN 'rejected' THEN rejection_reason IS NOT NULL AND thumbhash IS NULL
      ELSE false
    END
  );
--> statement-breakpoint
CREATE TABLE public.media_variants (
  media_id uuid NOT NULL REFERENCES public.media_uploads(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('avif', 'webp')),
  width integer NOT NULL CHECK (width IN (160, 320, 640, 960, 1280)),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 1280),
  bytes integer NOT NULL CHECK (bytes > 0),
  storage_key text NOT NULL UNIQUE CHECK (btrim(storage_key) <> ''),
  PRIMARY KEY (media_id, format, width)
);
