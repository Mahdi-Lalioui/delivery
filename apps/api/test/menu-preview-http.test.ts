import { menuPreviewOutput } from "@zaafran/contracts/menu-preview";
import type { createMenuPreviewRepository } from "@zaafran/db/menu-preview";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMenuPreviewRepository>;

const now = new Date("2026-11-08T12:00:00.000Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343101";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343102";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343103";
const categoryId = "01932f18-3150-7c33-8a7a-53acfd343104";
const itemId = "01932f18-3150-7c33-8a7a-53acfd343105";
const owner = { role: "merchant_owner", accountId, sessionId } as const;
const path = "/v1/merchants/" + merchantId + "/menu/preview";
const preview = {
  revision: 4,
  restaurantName: "Restaurant fictif",
  categories: [
    {
      categoryId,
      names: { fr: "Plats" },
      items: [
        {
          itemId,
          names: { fr: "Couscous fictif" },
          descriptions: { ar: "وصف تجريبي" },
          priceDzd: 650,
          tags: ["spicy" as const],
          isAvailable: true,
          soldOutUntil: null,
        },
      ],
    },
  ],
};

function setup(actor?: Actor) {
  const repository = { read: vi.fn<Repository["read"]>() };
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    menuPreview: { repository, now: () => now },
  });
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[ADM-04:http] returns the listable preview for the signed-in member", async () => {
  const { api, repository } = setup(owner);
  repository.read.mockResolvedValue({ kind: "previewed", ...preview });
  const upperCaseId = "/v1/merchants/" + merchantId.toUpperCase() + "/menu/preview";
  const result = await api.inject({ method: "GET", url: upperCaseId });

  expect(result.statusCode).toBe(200);
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(menuPreviewOutput.parse(result.json())).toEqual(preview);
  expect(repository.read).toHaveBeenCalledExactlyOnceWith({ accountId, merchantId, now });
});

test("[ADM-04:http] hides another tenant's or a staff member's preview as not found", async () => {
  const { api, repository } = setup(owner);
  repository.read.mockResolvedValue({ kind: "not_found" });
  const result = await api.inject({ method: "GET", url: path });

  expect(result.statusCode).toBe(404);
  expect(result.json()).toMatchObject({ code: "not_found" });
});

test("[ADM-04:http] rejects anonymous callers before reading the menu", async () => {
  const { api, repository } = setup(undefined);
  const result = await api.inject({ method: "GET", url: path });

  expect(result.statusCode).toBe(401);
  expect(repository.read).not.toHaveBeenCalled();
});

test("[ADM-04:http] rejects a malformed merchant id", async () => {
  const { api, repository } = setup(owner);
  const result = await api.inject({ method: "GET", url: "/v1/merchants/not-a-uuid/menu/preview" });

  expect(result.statusCode).toBe(400);
  expect(repository.read).not.toHaveBeenCalled();
});
