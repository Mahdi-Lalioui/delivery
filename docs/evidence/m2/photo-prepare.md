# M2 private photo codec

- `pnpm exec vitest run --coverage.enabled=false packages/media/test` passed all 42 media tests. The codec verifies the declared input type, caps uploads at 8 MiB and decoded images at 24 Mi pixels, normalizes orientation, keeps known allocation and thread failures retryable, and emits WebP previews bounded to 1280 pixels per side.
- `docker build --platform linux/amd64 -t zaafran-media-heic infra/media-heic` succeeded. The pinned runtime passed all eight native conformance cases, including primary HEVC, rotation, size limits, invalid inputs, and failure exits.
- `HEIC_DECODER_PATH="$PWD/packages/media/test/heic-decoder-docker.sh" node packages/media/test/heic-decoder.conformance.mjs` passed. It exercises the production adapter with the synthetic HEVC fixture and verifies a 96×64 WebP without EXIF, IPTC, XMP or ICC metadata.
- The codec and preparation cases use qualified acceptance markers. The original-session crop command, ready variants, upload UI and full journey remain open under M2-6.
- Media hardening still needs reference fixtures for wide-gamut HEIC and premultiplied HEIC alpha. The current RGBA handoff drops color-profile and alpha representation metadata. Worker wiring also needs a scoped temporary volume so a killed worker cannot leave private input files indefinitely.

## Persisted preparation

- The focused database and production API suites passed 14 PostGIS cases, including first-writer-wins preparation, state constraints, scoped preview streaming, and denial across accounts.
- The Graphile Worker integration test runs the actual queued job. It checks that the resulting WebP is private, the upload reaches `awaiting_crop`, and the original remains available for cropping.
- Worker unit cases cover malformed jobs, interrupted database completion, storage failure, byte and digest mismatches, and retrying cleanup after a committed rejection.
- See D-018 for coordinated API and worker rollout. Set a shared `MEDIA_STORAGE_ROOT` and provide the worker with `HEIC_DECODER_PATH` for real HEIC jobs.
