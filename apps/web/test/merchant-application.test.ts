import { expect, test } from "vitest";
import {
  draftAfterRefusal,
  parseMerchantDraft,
  prepareMerchantAttempt,
} from "../src/merchant/merchant-application";

const communeId = "019d6abc-1234-7234-8234-123456789abc";
const draft = {
  restaurantName: "  Restaurant fictif  ",
  ownerName: "Propriétaire fictif",
  communeId,
  latitude: "٣٦٫٧٦٦٦٥٨١",
  longitude: "3,0574036",
  cuisines: ["algerian", "grill"],
  rcNumber: "   ",
  photoIds: [],
};

test("[MER-01:web] canonicalizes Arabic and French coordinate input and omits a blank RC number", () => {
  expect(parseMerchantDraft(draft)).toEqual({
    kind: "valid",
    data: {
      restaurantName: "Restaurant fictif",
      ownerName: "Propriétaire fictif",
      communeId,
      pin: { latitude: 36.7666581, longitude: 3.0574036 },
      cuisines: ["algerian", "grill"],
    },
  });
});

test("[MER-01:web] sends ready application photos in order and omits an empty list", () => {
  const photoIds = ["019d6abc-1234-7234-8234-123456789a01", "019d6abc-1234-7234-8234-123456789a02"];
  const result = parseMerchantDraft({ ...draft, photoIds });
  expect(result).toMatchObject({ kind: "valid", data: { photoIds } });
  expect(parseMerchantDraft(draft)).not.toHaveProperty("data.photoIds");
});

test("[MER-01:web] identifies required fields and refuses ambiguous or out-of-range coordinates", () => {
  const result = parseMerchantDraft({
    ...draft,
    ownerName: "",
    communeId: "",
    latitude: "",
    longitude: "181",
    cuisines: [],
    rcNumber: "x".repeat(65),
  });
  expect(result).toEqual({
    kind: "invalid",
    fields: ["ownerName", "communeId", "latitude", "longitude", "cuisines", "rcNumber"],
  });
  expect(parseMerchantDraft({ ...draft, longitude: "0x12" })).toEqual({
    kind: "invalid",
    fields: ["longitude"],
  });
});

test("[MER-01:web] retains a request key for canonical retries and rotates it for an edited pin", () => {
  const result = parseMerchantDraft(draft);
  if (result.kind !== "valid") throw new Error("Expected valid application fixture.");

  const first = prepareMerchantAttempt(result.data);
  expect(first.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(prepareMerchantAttempt({ ...result.data }, first)).toBe(first);
  expect(
    prepareMerchantAttempt({ ...result.data, pin: { ...result.data.pin, latitude: 36.77 } }, first)
      .idempotencyKey,
  ).not.toBe(first.idempotencyKey);
});

test("[MER-01:web] drops the refused photo after photos_unavailable and keeps the other fields", () => {
  const photoIds = ["019d6abc-1234-7234-8234-123456789a01"];
  const refused = draftAfterRefusal({ ...draft, photoIds }, "photosUnavailable");
  expect(refused).toEqual({ ...draft, photoIds: [] });
});

test("[MER-01:web] keeps the photo after any other refusal", () => {
  const withPhoto = { ...draft, photoIds: ["019d6abc-1234-7234-8234-123456789a01"] };
  expect(draftAfterRefusal(withPhoto, "outsideCommune")).toBe(withPhoto);
  expect(draftAfterRefusal(withPhoto, "submitError")).toBe(withPhoto);
});
