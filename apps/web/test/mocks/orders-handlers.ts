import {
  customerFavouritesOutput,
  customerFavouriteWriteOutput,
  customerOrderHistoryOutput,
  customerOrderReceiptOutput,
  customerReorderOutput,
} from "@zaafran/contracts/retention";
import { http, HttpResponse } from "msw";

export const orderMockIds = {
  orderId: "019d6abc-0000-7000-8000-000000000601",
  oldOrderId: "019d6abc-0000-7000-8000-000000000602",
  merchantId: "019d6abc-0000-7000-8000-000000000002",
  otherMerchantId: "019d6abc-0000-7000-8000-000000000603",
  itemId: "019d6abc-0000-7000-8000-000000000604",
  soldOutItemId: "019d6abc-0000-7000-8000-000000000605",
} as const;
const ids = orderMockIds;

export function ordersMockState() {
  const orders = customerOrderHistoryOutput.parse({
    nextCursor: null,
    orders: [
      {
        orderId: ids.orderId,
        merchantId: ids.merchantId,
        restaurantName: "Dar El Couscous",
        shortCode: "K7Q2",
        status: "delivered",
        fulfilment: "delivery",
        totalDzd: 2350,
        placedAt: "2027-02-10T18:40:00.000Z",
      },
      {
        orderId: ids.oldOrderId,
        merchantId: ids.otherMerchantId,
        restaurantName: "Pizzeria Bab El Oued",
        shortCode: "M3X9",
        status: "cancelled",
        fulfilment: "pickup",
        totalDzd: 1200,
        placedAt: "2027-02-02T12:10:00.000Z",
      },
    ],
  }).orders;
  const favourites: Record<string, boolean> = { [ids.merchantId]: true };
  return { orders, favourites };
}

type State = ReturnType<typeof ordersMockState>;

const receipt = customerOrderReceiptOutput.parse({
  orderId: ids.orderId,
  merchantId: ids.merchantId,
  restaurantName: "Dar El Couscous",
  shortCode: "K7Q2",
  status: "delivered",
  fulfilment: "delivery",
  placedAt: "2027-02-10T18:40:00.000Z",
  lines: [
    {
      itemId: ids.itemId,
      names: { fr: "Couscous royal", ar: "كسكس ملكي" },
      unitPriceDzd: 1500,
      quantity: 1,
      options: [
        { optionId: ids.soldOutItemId, names: { fr: "Merguez en plus" }, priceDeltaDzd: 200 },
      ],
      lineTotalDzd: 1700,
    },
    {
      itemId: ids.soldOutItemId,
      names: { fr: "Chorba", ar: "شوربة" },
      unitPriceDzd: 450,
      quantity: 1,
      options: [],
      lineTotalDzd: 450,
    },
  ],
  subtotalDzd: 2150,
  discountDzd: 0,
  deliveryFeeDzd: 200,
  totalDzd: 2350,
});

export function ordersHandlers(state: State = ordersMockState()) {
  return [
    http.get("*/v1/me/orders", () =>
      HttpResponse.json(
        customerOrderHistoryOutput.parse({ orders: state.orders, nextCursor: null }),
      ),
    ),
    http.get("*/v1/me/orders/:orderId/receipt", ({ params }) =>
      params.orderId === ids.orderId
        ? HttpResponse.json(receipt)
        : new HttpResponse(null, { status: 404 }),
    ),
    http.post("*/v1/me/orders/:orderId/reorder", ({ params }) =>
      params.orderId === ids.orderId
        ? HttpResponse.json(
            customerReorderOutput.parse({
              draft: {
                merchantId: ids.merchantId,
                items: [{ itemId: ids.itemId, quantity: 1, optionIds: [] }],
              },
              unavailable: [ids.soldOutItemId],
              priceChanges: [{ itemId: ids.itemId, oldDzd: 1500, newDzd: 1600 }],
            }),
          )
        : new HttpResponse(null, { status: 404 }),
    ),
    http.get("*/v1/me/favourites", () =>
      HttpResponse.json(
        customerFavouritesOutput.parse({
          restaurants: Object.entries(state.favourites)
            .filter(([, isOn]) => isOn)
            .map(([merchantId]) => ({
              merchantId,
              name: "Dar El Couscous",
              slug: "dar-el-couscous",
              coverMediaId: null,
              isOpen: true,
            })),
        }),
      ),
    ),
    ...(["put", "delete"] as const).map((method) =>
      http[method]("*/v1/me/favourites/:merchantId", ({ params }) => {
        if (typeof params.merchantId !== "string") return new HttpResponse(null, { status: 404 });
        state.favourites[params.merchantId] = method === "put";
        return HttpResponse.json(
          customerFavouriteWriteOutput.parse({
            merchantId: params.merchantId,
            isFavourite: method === "put",
          }),
        );
      }),
    ),
  ];
}
