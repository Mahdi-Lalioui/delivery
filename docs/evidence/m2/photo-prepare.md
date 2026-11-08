# M2 private photo codec

- `pnpm exec vitest run --coverage.enabled=false packages/media/test` passed all 42 media tests. The codec verifies the declared input type, caps uploads at 8 MiB and decoded images at 24 Mi pixels, normalizes orientation, keeps known allocation and thread failures retryable, and emits WebP previews bounded to 1280 pixels per side.
- `docker build --platform linux/amd64 -t zaafran-media-heic infra/media-heic` succeeded. The pinned runtime passed all eight native conformance cases, including primary HEVC, rotation, size limits, invalid inputs, and failure exits.
- `HEIC_DECODER_PATH="$PWD/packages/media/test/heic-decoder-docker.sh" node packages/media/test/heic-decoder.conformance.mjs` passed. It exercises the production adapter with the synthetic HEVC fixture and verifies a 96×64 WebP without EXIF, IPTC, XMP or ICC metadata.
- The worker job, persisted preview and crop states, ready variants, and upload UI are still open under M2-6. The codec cases use a qualified acceptance marker until that full journey passes.
- Media hardening still needs reference fixtures for wide-gamut HEIC and premultiplied HEIC alpha. The current RGBA handoff drops color-profile and alpha representation metadata. Worker wiring also needs a scoped temporary volume so a killed worker cannot leave private input files indefinitely.
