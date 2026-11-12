import { expect, test } from "vitest";
import {
  deliveryCodeDigest,
  deriveDeliveryCode,
  revealDeliveryCode,
} from "../src/order-delivery-code.ts";

const key = Buffer.alloc(32, 7);
const orderId = "01932f18-3150-7c33-8a7a-53acfd343001";

test("[ORD-09] derives stable four-digit codes and binds the stored digest to the order and key", () => {
  const code = deriveDeliveryCode(key, orderId);
  expect(code).toMatch(/^\d{4}$/u);
  const digest = deliveryCodeDigest(key, orderId, code);
  expect(digest).toHaveLength(32);
  expect(revealDeliveryCode(key, orderId, digest)).toBe(code);
  expect(revealDeliveryCode(Buffer.alloc(32, 8), orderId, digest)).toBeNull();
  expect(revealDeliveryCode(key, orderId.replace(/1$/u, "2"), digest)).toBeNull();
});
