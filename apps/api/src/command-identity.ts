import { createHash } from "node:crypto";

export function commandIdentity(key: string, request: object) {
  return {
    idempotencyKeyHash: createHash("sha256").update(key).digest(),
    requestHash: createHash("sha256").update(JSON.stringify(request)).digest(),
  };
}
