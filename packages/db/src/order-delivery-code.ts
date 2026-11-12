import { createHmac, timingSafeEqual } from "node:crypto";

const codeRange = 10_000;
const uniformLimit = Math.floor(2 ** 48 / codeRange) * codeRange;

export function deriveDeliveryCode(key: Uint8Array, orderId: string): string {
  for (let counter = 0; ; counter += 1) {
    const digest = createHmac("sha256", key)
      .update("delivery-code\0")
      .update(orderId.toLowerCase())
      .update("\0")
      .update(String(counter))
      .digest();
    const value = digest.readUIntBE(0, 6);
    if (value < uniformLimit) return String(value % codeRange).padStart(4, "0");
  }
}

export function deliveryCodeDigest(key: Uint8Array, orderId: string, code: string): Buffer {
  return createHmac("sha256", key)
    .update("delivery-proof\0")
    .update(orderId.toLowerCase())
    .update("\0")
    .update(code)
    .digest();
}

export function matchesDeliveryCode(expected: Uint8Array, supplied: Uint8Array): boolean {
  return expected.length === 32 && supplied.length === 32 && timingSafeEqual(expected, supplied);
}

export function revealDeliveryCode(key: Uint8Array, orderId: string, stored: Uint8Array | null) {
  const code = deriveDeliveryCode(key, orderId);
  return stored === null || matchesDeliveryCode(stored, deliveryCodeDigest(key, orderId, code))
    ? code
    : null;
}
