import {
  customerFavouritesOutput,
  customerFavouriteWriteOutput,
  customerOrderHistoryOutput,
  customerOrderReceiptOutput,
  customerReorderOutput,
} from "@zaafran/contracts/retention";

// CUS-21 / CUS-23 client on lane A's retention contract. Routes follow
// docs/requests/lane-b-retention-admin.md and run on MSW until lane A stores orders.

export type OrderSummary = ReturnType<typeof customerOrderHistoryOutput.parse>["orders"][number];
export type Receipt = ReturnType<typeof customerOrderReceiptOutput.parse>;
export type Reorder = ReturnType<typeof customerReorderOutput.parse>;
export type Favourite = ReturnType<typeof customerFavouritesOutput.parse>["restaurants"][number];
type Failure = { kind: "sign-in" | "not-found" | "error" };
export type HistoryPage =
  { kind: "ready"; orders: OrderSummary[]; nextCursor: string | null } | Failure;

const requestOptions = {
  credentials: "same-origin",
  cache: "no-store",
  redirect: "error",
} satisfies RequestInit;

async function read<T>(
  path: string,
  parse: (body: unknown) => T | undefined,
  init: RequestInit = {},
): Promise<{ kind: "ready"; data: T } | Failure> {
  try {
    const response = await fetch(path, { ...requestOptions, ...init });
    if (response.status === 401 || response.status === 403) return { kind: "sign-in" };
    if (response.status === 404) return { kind: "not-found" };
    if (!response.ok) return { kind: "error" };
    const data = parse(await response.json());
    return data === undefined ? { kind: "error" } : { kind: "ready", data };
  } catch {
    return { kind: "error" };
  }
}

function parser<T>(schema: {
  safeParse: (body: unknown) => { success: true; data: T } | { success: false };
}) {
  return (body: unknown) => {
    const result = schema.safeParse(body);
    return result.success ? result.data : undefined;
  };
}

export async function loadOrderHistory(input: {
  cursor?: string | undefined;
  signal?: AbortSignal | undefined;
}): Promise<HistoryPage> {
  const query = new URLSearchParams({ limit: "20" });
  if (input.cursor !== undefined) query.set("cursor", input.cursor);
  const result = await read(
    `/v1/me/orders?${query.toString()}`,
    parser(customerOrderHistoryOutput),
    input.signal ? { signal: input.signal } : {},
  );
  if (result.kind !== "ready") return result;
  if (input.cursor !== undefined && result.data.nextCursor === input.cursor)
    return { kind: "error" };
  return { kind: "ready", ...result.data };
}

function orderPath(orderId: string, suffix: string): string {
  return `/v1/me/orders/${encodeURIComponent(orderId)}/${suffix}`;
}

/** CUS-21 receipt; the totals are re-checked by the contract (subtotal − discount + fee = total). */
export async function loadReceipt(
  orderId: string,
): Promise<{ kind: "ready"; receipt: Receipt } | Failure> {
  const result = await read(orderPath(orderId, "receipt"), parser(customerOrderReceiptOutput));
  if (result.kind !== "ready") return result;
  return result.data.orderId === orderId
    ? { kind: "ready", receipt: result.data }
    : { kind: "error" };
}

/** CUS-21 reorder: a cart draft plus the items now unavailable and the prices that changed. */
export async function reorder(input: {
  orderId: string;
  merchantId: string;
  key: string;
}): Promise<{ kind: "ready"; reorder: Reorder } | Failure> {
  const result = await read(orderPath(input.orderId, "reorder"), parser(customerReorderOutput), {
    method: "POST",
    headers: { "Idempotency-Key": input.key },
  });
  if (result.kind !== "ready") return result;
  return result.data.draft.merchantId === input.merchantId
    ? { kind: "ready", reorder: result.data }
    : { kind: "error" };
}

export async function loadFavourites(
  signal?: AbortSignal,
): Promise<{ kind: "ready"; restaurants: Favourite[] } | Failure> {
  const result = await read(
    "/v1/me/favourites",
    parser(customerFavouritesOutput),
    signal ? { signal } : {},
  );
  return result.kind === "ready" ? { kind: "ready", restaurants: result.data.restaurants } : result;
}

/** CUS-23: PUT adds, DELETE removes; both are idempotent, so retries are safe. */
export async function setFavourite(
  merchantId: string,
  isFavourite: boolean,
): Promise<{ kind: "saved" } | Failure> {
  const result = await read(
    `/v1/me/favourites/${encodeURIComponent(merchantId)}`,
    parser(customerFavouriteWriteOutput),
    { method: isFavourite ? "PUT" : "DELETE" },
  );
  if (result.kind !== "ready") return result;
  return result.data.merchantId === merchantId && result.data.isFavourite === isFavourite
    ? { kind: "saved" }
    : { kind: "error" };
}
