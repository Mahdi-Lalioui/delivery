import { z } from "./schema.js";
import { merchantApplicationInput } from "./merchant.js";

const addressText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !value.includes("\0"));

export const addressInput = z.strictObject({
  label: addressText(80),
  pin: merchantApplicationInput.shape.pin,
  building: addressText(120).optional(),
  floor: addressText(32).optional(),
  apartment: addressText(32).optional(),
  landmark: addressText(160).optional(),
  instructions: addressText(500).optional(),
  voiceMediaId: z.uuid().optional(),
  isDefault: z.boolean().optional(),
});
export const addressParams = z.strictObject({ addressId: z.uuid() });
export const addressOutput = addressInput.extend({
  addressId: z.uuid(),
  communeId: z.uuid().nullable(),
  plusCode: z.string().min(4).max(16),
  isDefault: z.boolean(),
});
export const addressListOutput = z.strictObject({ addresses: z.array(addressOutput) });
