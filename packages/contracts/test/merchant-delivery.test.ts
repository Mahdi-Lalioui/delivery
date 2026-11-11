import { describe, expect, it } from "vitest";
import {
  merchantDeliverySettingsInput,
  merchantDeliverySettingsOutput,
} from "../src/merchant-delivery.ts";

const settings = {
  pickupEnabled: true,
  deliveryEnabled: true,
  pickupMinimumDzd: 0,
  prepMinutes: 20,
  zone: { radiusMeters: 3000, feeDzd: 200, minimumDzd: 900, travelMinutes: 12 },
};

describe("MER-17 merchant delivery settings", () => {
  it("accepts delivery with a radius and pickup without a zone", () => {
    expect(merchantDeliverySettingsInput.parse({ ...settings, expectedRevision: 0 })).toEqual({
      ...settings,
      expectedRevision: 0,
    });
    expect(
      merchantDeliverySettingsInput.safeParse({
        ...settings,
        deliveryEnabled: false,
        zone: null,
        expectedRevision: 0,
      }).success,
    ).toBe(true);
  });

  it("requires a radius when enabling delivery and checks integer values", () => {
    const input = { ...settings, expectedRevision: 0 };
    expect(merchantDeliverySettingsInput.safeParse({ ...input, zone: null }).success).toBe(false);
    for (const patch of [
      { radiusMeters: 99 },
      { radiusMeters: 100_001 },
      { radiusMeters: 1000.5 },
      { feeDzd: -1 },
      { minimumDzd: 1.5 },
      { travelMinutes: 0 },
      { travelMinutes: 121 },
    ]) {
      expect(
        merchantDeliverySettingsInput.safeParse({
          ...input,
          zone: { ...settings.zone, ...patch },
        }).success,
      ).toBe(false);
    }
    expect(
      merchantDeliverySettingsInput.safeParse({ ...input, merchantId: "untrusted" }).success,
    ).toBe(false);
  });

  it("can read an older merchant with a polygon and no merchant radius", () => {
    expect(
      merchantDeliverySettingsOutput.safeParse({
        sessionId: "01932f18-3150-7c33-8a7a-53acfd343001",
        revision: 2,
        settings: { ...settings, zone: null },
      }).success,
    ).toBe(true);
  });
});
