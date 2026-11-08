# Media storage review

- [ ] **P1 — S3 upload length is trusted before reading the stream.** A stream can send bytes beyond the declared content length. Reject overlong, truncated and interrupted bodies and retain conditional-write replay behavior.
