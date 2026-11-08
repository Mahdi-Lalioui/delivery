import {
  menuOptionGroupDetailOutput,
  menuOptionGroupPageOutput,
  menuOptionGroupWriteOutput,
} from "@zaafran/contracts/menu";
import type { createMenuOptionGroupRepository } from "@zaafran/db/menu-option-group";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";
import type { Actor } from "../src/policy.ts";

type Repository = ReturnType<typeof createMenuOptionGroupRepository>;
const now = new Date("2026-11-07T12:00:00.000Z");
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const sessionId = "01932f18-3150-7c33-8a7a-53acfd343002";
const merchantId = "01932f18-3150-7c33-8a7a-53acfd343003";
const optionGroupId = "01932f18-3150-7c33-8a7a-53acfd343004";
const optionId = "01932f18-3150-7c33-8a7a-53acfd343005";
const editor = { role: "merchant_manager", accountId, sessionId } as const;
const path = "/v1/merchants/" + merchantId + "/menu/option-groups";
const detailPath = path + "/" + optionGroupId;
const headers = { "idempotency-key": "fixture-group-command", "x-expected-session-id": sessionId };
const names = { ar: "صلصات", fr: "Sauces" };
const option = {
  names: { fr: "Épicée" },
  priceDeltaDzd: 25,
  isDefault: true,
  isAvailable: false,
};
const summary = { optionGroupId, names, minimum: 0, maximum: 1 };
const group = { ...summary, options: [{ ...option, optionId }] };
const createBody = { names, minimum: 0, maximum: 1, options: [option], expectedRevision: 2 };
const create = { method: "POST", url: path, payload: createBody, headers } as const;
const update = {
  method: "PUT",
  url: detailPath,
  headers,
  payload: { ...createBody, options: [{ ...option, optionId }] },
} as const;

function setup(actor?: Actor) {
  const repository = {
    list: vi.fn<Repository["list"]>(),
    detail: vi.fn<Repository["detail"]>(),
    create: vi.fn<Repository["create"]>(),
    update: vi.fn<Repository["update"]>(),
  } satisfies Repository;
  const options = {
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve(actor),
    menuOptionGroup: { repository, now: () => now },
  };
  const api = createApi(options);
  onTestFinished(() => api.close());
  return { api, repository };
}

test("[MER-10:http] paginates reusable group summaries and returns details with stable option IDs", async () => {
  const { api, repository } = setup(editor);
  const context = { restaurantName: "Restaurant fictif" };
  repository.list.mockResolvedValue({
    context,
    kind: "listed",
    revision: 2,
    optionGroups: [summary],
    nextCursor: null,
  });
  repository.detail.mockResolvedValue({ kind: "found", revision: 2, optionGroup: group });

  const list = await api.inject(
    path + "?limit=5&cursor=" + encodeURIComponent("2~" + optionGroupId),
  );
  expect(list.statusCode).toBe(200);
  expect(list.headers["cache-control"]).toBe("no-store");
  expect(menuOptionGroupPageOutput.parse(list.json())).toEqual({
    sessionId,
    revision: 2,
    context,
    optionGroups: [summary],
    nextCursor: null,
  });
  expect(repository.list).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    limit: 5,
    cursor: { revision: 2, optionGroupId },
  });
  const detail = await api.inject(detailPath);
  expect(detail.statusCode).toBe(200);
  expect(detail.headers["cache-control"]).toBe("no-store");
  expect(menuOptionGroupDetailOutput.parse(detail.json())).toEqual({
    sessionId,
    revision: 2,
    optionGroup: group,
  });
  expect(repository.detail).toHaveBeenCalledExactlyOnceWith({
    accountId,
    merchantId,
    optionGroupId,
  });
});

test("[MER-10:http] creates and updates groups with session-bound, revision-checked receipts", async () => {
  const { api, repository } = setup(editor);
  repository.create.mockResolvedValue({ kind: "applied", revision: 3, optionGroup: group });
  repository.update.mockResolvedValue({ kind: "replayed", revision: 3, optionGroup: group });

  const invalidCreate = await api.inject({
    ...create,
    payload: { ...createBody, options: [{ ...option, optionId }] },
  });
  expect(invalidCreate.statusCode).toBe(400);
  expect(repository.create).not.toHaveBeenCalled();

  const created = await api.inject(create);
  expect(created.statusCode).toBe(201);
  expect(menuOptionGroupWriteOutput.parse(created.json())).toEqual({
    revision: 3,
    optionGroup: group,
  });
  expect(repository.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, input: createBody, now }),
  );

  const updated = await api.inject(update);
  expect(updated.statusCode).toBe(200);
  expect(menuOptionGroupWriteOutput.parse(updated.json())).toEqual({
    revision: 3,
    optionGroup: group,
  });
  expect(repository.update).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId, merchantId, optionGroupId, input: update.payload, now }),
  );
});

test.each([
  [undefined, 401],
  [{ ...editor, role: "merchant_staff" }, 403],
  [{ ...editor, role: "admin" }, 403],
] as const)(
  "[MER-23:http] option groups deny actors outside merchant editing policy",
  async (actor, status) => {
    const { api, repository } = setup(actor);
    for (const request of [path, detailPath, create, update]) {
      expect((await api.inject(request)).statusCode).toBe(status);
    }
    for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
  },
);

test("[AUTH-06:http] a switched session cannot mutate a stale option group draft", async () => {
  const { api, repository } = setup(editor);
  for (const request of [create, update]) {
    const response = await api.inject({
      ...request,
      headers: { ...headers, "x-expected-session-id": optionId },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "session_changed" });
  }
  expect(repository.create).not.toHaveBeenCalled();
  expect(repository.update).not.toHaveBeenCalled();
});

test("[MER-10:http] maps cursor, revision and tenant errors without disclosing foreign option groups", async () => {
  const { api, repository } = setup(editor);
  repository.list.mockResolvedValue({ kind: "invalid_cursor" });
  repository.detail.mockResolvedValue({ kind: "not_found" });
  repository.create.mockResolvedValue({ kind: "revision_conflict" });
  repository.update.mockResolvedValue({ kind: "idempotency_conflict" });
  for (const [request, status, code] of [
    [path, 400, "invalid_cursor"],
    [detailPath, 404, "not_found"],
    [create, 409, "revision_conflict"],
    [update, 409, "idempotency_conflict"],
  ] as const) {
    const response = await api.inject(request);
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code });
  }
});
