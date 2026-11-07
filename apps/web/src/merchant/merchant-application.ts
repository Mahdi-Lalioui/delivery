import { merchantApplicationInput } from "@zaafran/contracts/merchant";
import type { Application } from "./merchant-http";

export interface MerchantDraft {
  restaurantName: string;
  ownerName: string;
  communeId: string;
  latitude: string;
  longitude: string;
  cuisines: readonly string[];
  rcNumber: string;
}

const fieldNames = [
  "restaurantName",
  "ownerName",
  "communeId",
  "latitude",
  "longitude",
  "cuisines",
  "rcNumber",
] as const satisfies readonly (keyof MerchantDraft)[];

export type DraftField = (typeof fieldNames)[number];
type DraftResult = { kind: "valid"; data: Application } | { kind: "invalid"; fields: DraftField[] };

function parseCoordinate(value: string): number | undefined {
  const normalized = value
    .trim()
    .replace(/[٠-٩۰-۹]/g, (digit) => {
      const zero = digit >= "۰" ? "۰" : "٠";
      return String(digit.charCodeAt(0) - zero.charCodeAt(0));
    })
    .replace(/[,٫]/g, ".")
    .replace("−", "-");

  return /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(normalized)
    ? Number(normalized)
    : undefined;
}

export function parseMerchantDraft(draft: MerchantDraft): DraftResult {
  const { restaurantName, ownerName, communeId, latitude, longitude, cuisines, rcNumber } = draft;
  const result = merchantApplicationInput.safeParse({
    restaurantName,
    ownerName,
    communeId,
    pin: { latitude: parseCoordinate(latitude), longitude: parseCoordinate(longitude) },
    cuisines,
    ...(rcNumber.trim() ? { rcNumber } : {}),
  });

  if (result.success) return { kind: "valid", data: result.data };

  const issues = result.error.issues.map(({ path: [root, leaf] }) =>
    root === "pin" ? leaf : root,
  );
  return { kind: "invalid", fields: fieldNames.filter((field) => issues.includes(field)) };
}

interface MerchantAttempt {
  application: Application;
  idempotencyKey: string;
}

export function prepareMerchantAttempt(
  application: Application,
  previous?: MerchantAttempt,
): MerchantAttempt {
  if (previous && JSON.stringify(previous.application) === JSON.stringify(application)) {
    return previous;
  }
  return { application, idempotencyKey: crypto.randomUUID() };
}
