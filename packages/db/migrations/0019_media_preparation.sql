ALTER TABLE public.media_uploads
  ADD COLUMN preview_key text UNIQUE CHECK (btrim(preview_key) <> ''),
  ADD COLUMN preview_width integer CHECK (preview_width BETWEEN 1 AND 1280),
  ADD COLUMN preview_height integer CHECK (preview_height BETWEEN 1 AND 1280),
  ADD COLUMN rejection_reason text CHECK (
    rejection_reason IN ('content_type_mismatch', 'invalid_image', 'image_too_large')
  ),
  DROP CONSTRAINT media_upload_adoption_check,
  ADD CONSTRAINT media_upload_adoption_check CHECK (
    (status = 'awaiting_upload' AND quarantine_key IS NULL AND content_digest IS NULL AND adopted_at IS NULL)
    OR
    (status IN ('preparing', 'awaiting_crop', 'rejected') AND quarantine_key IS NOT NULL
      AND content_digest IS NOT NULL AND adopted_at IS NOT NULL)
  ),
  ADD CONSTRAINT media_upload_preparation_check CHECK (
    (preview_key IS NOT NULL) = (status = 'awaiting_crop')
    AND (preview_width IS NOT NULL) = (status = 'awaiting_crop')
    AND (preview_height IS NOT NULL) = (status = 'awaiting_crop')
    AND (rejection_reason IS NOT NULL) = (status = 'rejected')
  );
