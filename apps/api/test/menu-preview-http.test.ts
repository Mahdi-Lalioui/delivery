import { problemResponseSchema } from "@zaafran/contracts/health";
import { menuPreviewDetailOutput, menuPreviewPageOutput } from "@zaafran/contracts/menu";
import type { createMenuPreviewRepository } from "@zaafran/db/menu-preview";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMenuPreviewRepository>;

const now = new Date("2026-11-08T12:00:00.000Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const categoryId = "01932f18-3150-7c33-8a7a-53acfd343004";
const itemId = "01932f18-3150-7c33-8a7a-53acfd343005";
const owner = { role: "merchant_owner", accountId, sessionId } as const;
const path = `/v1/merchants/${merchantId}/menu/preview/items`;
const listPath = path + "?categoryId=" + categoryId;
const detailPath = `${path}/${itemId}?expectedRevision=4`;
const names = { fr: "Plat fictif" };
const item = {
  itemId,
  names,
  descriptions: { fr: "Description fictive" },
  priceDzd: 750,
  photoId: null,
  tags: [],
  isAvailable: false,
};

function setup(actor?: Actor) {
  const repository = { list: vi.fn<Repository["list"]>(), detail: vi.fn<Repository["detail"]>() };
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    menuPreview: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[M2-10:preview] returns a private projection bound to the authenticated session and category cursor", async () => {
  const { api, repository } = setup(owner);
  const page = {
    revision: 4,
    context: { restaurantName: "Restaurant fictif", categoryNames: names },
    items: [item],
    nextCursor: null,
  };
  repository.list.mockResolvedValue({ kind: "listed", ...page });
  const response = await api.inject(listPath + "&limit=1&cursor=4~" + itemId);
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(menuPreviewPageOutput.parse(response.json())).toEqual({ ...page, sessionId });
  expect(repository.list).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    categoryId,
    limit: 1,
    now,
    cursor: { revision: 4, itemId },
  });
});

test("[M2-10:preview] passes the item ID and exact revision to the same tenant's detail read", async () => {
  const { api, repository } = setup({ ...owner, role: "merchant_manager" });
  const detail = { item, revision: 4, optionGroups: [] };
  repository.detail.mockResolvedValue({ kind: "found", ...detail });
  const response = await api.inject(detailPath);
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(menuPreviewDetailOutput.parse(response.json())).toEqual({ ...detail, sessionId });
  expect(repository.detail).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    itemId,
    now,
    expectedRevision: 4,
  });
});

test.each([
  [undefined, 401],
  [{ ...owner, role: "merchant_staff" }, 403],
] as const)(
  "[M2-10:preview] rejects an unauthorized actor before the repository, %s",
  async (actor, status) => {
    const { api, repository } = setup(actor);
    expect((await api.inject(listPath)).statusCode).toBe(status);
    expect((await api.inject(detailPath)).statusCode).toBe(status);
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.detail).not.toHaveBeenCalled();
  },
);

test.each([
  ["not_found", 404],
  ["revision_conflict", 409],
] as const)("[M2-10:preview] maps scoped failures to %s", async (kind, status) => {
  const { api, repository } = setup(owner);
  repository.list.mockResolvedValue({ kind });
  repository.detail.mockResolvedValue({ kind });
  for (const url of [listPath, detailPath]) {
    const response = await api.inject(url);
    expect(response.statusCode).toBe(status);
    expect(problemResponseSchema.parse(response.json()).code).toBe(kind);
  }
  expect(repository.list).toHaveBeenCalledOnce();
  expect(repository.detail).toHaveBeenCalledOnce();
});

test("[M2-10:preview] rejects an invalid cursor and malformed revision", async () => {
  const { api, repository } = setup(owner);
  repository.list.mockResolvedValue({ kind: "invalid_cursor" });
  const response = await api.inject(listPath + "&cursor=4~" + itemId);
  expect(response.statusCode).toBe(400);
  expect(problemResponseSchema.parse(response.json()).code).toBe("invalid_cursor");
  expect((await api.inject(`${path}/${itemId}?expectedRevision=-1`)).statusCode).toBe(400);
  expect(repository.detail).not.toHaveBeenCalled();
});
