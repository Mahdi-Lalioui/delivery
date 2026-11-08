import { expect, test } from "vitest";
import { merchantProfilePhotosInput, merchantProfilePhotosOutput } from "../src/merchant.ts";

const coverPhotoId = "01932f18-3150-7c33-8a7a-53acfd343001";
const logoPhotoId = "01932f18-3150-7c33-8a7a-53acfd343002";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343003";

test("[MER-14:profile] edits both photo slots under an exact menu revision", () => {
  const input = { coverPhotoId, logoPhotoId, expectedRevision: 2 };
  expect(merchantProfilePhotosInput.parse(input)).toEqual(input);
  expect(merchantProfilePhotosInput.parse({ ...input, coverPhotoId: null })).toEqual({
    ...input,
    coverPhotoId: null,
  });
  for (const invalid of [
    { ...input, logoPhotoId: coverPhotoId },
    { ...input, logoPhotoId: "not-a-photo" },
    { ...input, expectedRevision: -1 },
    { ...input, extraField: true },
  ]) {
    expect(merchantProfilePhotosInput.safeParse(invalid).success).toBe(false);
  }
});

test("[MER-14:profile] returns only the photo IDs, current revision, session and restaurant name", () => {
  const output = {
    coverPhotoId,
    logoPhotoId,
    sessionId,
    revision: 2,
    restaurantName: "Table fictive",
  };
  expect(merchantProfilePhotosOutput.parse(output)).toEqual(output);
  expect(merchantProfilePhotosOutput.safeParse({ ...output, storageKey: "private" }).success).toBe(
    false,
  );
});
