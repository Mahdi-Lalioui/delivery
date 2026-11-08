import { z } from "zod";
import { merchantApplicationInput } from "./merchant.js";

const coordinates = merchantApplicationInput.shape.pin;
const communeId = z.uuid();

export const discoveryLocationInput = z.discriminatedUnion("kind", [
  coordinates.extend({ kind: z.literal("point") }),
  z.strictObject({ kind: z.literal("commune"), communeId }),
]);

export const discoveryLocationOutput = coordinates.extend({
  communeId: communeId.nullable(),
  serviceAreaId: z.uuid().nullable(),
});
