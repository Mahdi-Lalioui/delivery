import type { createAddressRepository } from "@zaafran/db/addresses";
import { expect, onTestFinished, test, vi } from "vitest";
import { createApi } from "../src/app.ts";

type AddressRepository = ReturnType<typeof createAddressRepository>;
const accountId = "01932f18-3150-7c33-8a7a-53acfd343001";
const addressId = "01932f18-3150-7c33-8a7a-53acfd343002";
const payload = { label: "Maison", pin: { latitude: 36.75, longitude: 3.0625 } };
const address = {
  ...payload,
  addressId,
  communeId: null,
  plusCode: "8F85Q327+22",
  isDefault: true,
};
const collection = "/v1/me/addresses";
const item = `${collection}/${addressId}`;

function setup() {
  const addresses = {
    list: vi.fn<AddressRepository["list"]>().mockResolvedValue([address]),
    create: vi.fn<AddressRepository["create"]>().mockResolvedValue({ kind: "saved", address }),
    update: vi.fn<AddressRepository["update"]>().mockResolvedValue({ kind: "missing" }),
    remove: vi.fn<AddressRepository["remove"]>().mockResolvedValue(false),
  };
  const api = createApi({
    checkReadiness: () => Promise.resolve(),
    resolveActor: () => Promise.resolve({ role: "customer", accountId, sessionId: addressId }),
    addresses,
  });
  onTestFinished(() => api.close());
  return { api, addresses };
}

test("[CUS-11:http] lists and saves only in the session scope, without caching address data", async () => {
  const { api, addresses } = setup();
  const list = await api.inject(collection);
  expect(list.statusCode).toBe(200);
  expect(list.json()).toEqual({ addresses: [address] });
  expect(list.headers["cache-control"]).toBe("no-store");
  expect(addresses.list).toHaveBeenCalledWith(accountId);

  const create = await api.inject({ method: "POST", url: collection, payload });
  expect(create.statusCode).toBe(201);
  expect(create.json()).toEqual(address);
  expect(create.headers["cache-control"]).toBe("no-store");
  expect(addresses.create).toHaveBeenCalledExactlyOnceWith(accountId, payload);
  expect(
    (
      await api.inject({
        method: "POST",
        url: collection,
        payload: { ...payload, userId: addressId },
      })
    ).statusCode,
  ).toBe(400);
  expect(addresses.create).toHaveBeenCalledTimes(1);
});

test("[CUS-11:http] reports unserviceable pins and conceals other accounts' addresses", async () => {
  const { api, addresses } = setup();
  addresses.create.mockResolvedValue({ kind: "outside_service_area" });
  const create = await api.inject({ method: "POST", url: collection, payload });
  expect(create.statusCode).toBe(400);
  expect(create.json()).toMatchObject({ code: "outside_service_area" });
  expect((await api.inject({ method: "PUT", url: item, payload })).statusCode).toBe(404);
  expect((await api.inject({ method: "DELETE", url: item })).statusCode).toBe(404);
  expect(addresses.update).toHaveBeenCalledWith(accountId, addressId, payload);
  expect(addresses.remove).toHaveBeenCalledWith(accountId, addressId);
});

test("[CUS-11:http] replaces and deletes an address in the caller's collection", async () => {
  const { api, addresses } = setup();
  addresses.update.mockResolvedValue({ kind: "saved", address });
  addresses.remove.mockResolvedValue(true);
  expect((await api.inject({ method: "PUT", url: item, payload })).json()).toEqual(address);
  const deletion = await api.inject({ method: "DELETE", url: item });
  expect(deletion.statusCode).toBe(204);
  expect(deletion.body).toBe("");
});
