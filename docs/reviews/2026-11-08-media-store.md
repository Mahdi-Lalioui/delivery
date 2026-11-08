# Media storage review

- [x] **P1 — S3 upload length is trusted before reading the stream.** The store withholds the final byte until the exact length, SHA-256 checksum and clean end of stream are verified. Success also requires the outgoing stream to end. Tests cover excess bytes, truncation, interruption, a wrong checksum, and an early success with buffered data. Conditional-write replay still maps to `exists`. The focused tests and real SeaweedFS conformance test passed.
