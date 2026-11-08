import {
  merchantReviewPageOutput,
  merchantReviewReplyInput,
  merchantReviewReplyOutput,
  merchantReviewReportInput,
  merchantReviewReportOutput,
  orderRatingInput,
  orderRatingOutput,
} from "@zaafran/contracts/ratings";
import { http, HttpResponse } from "msw";

// CUS-22 / MER-20 handlers for the routes in docs/requests/lane-b-ratings.md.

export const ratingMockIds = {
  orderId: "019d6abc-0000-7000-8000-000000000101",
  pickupOrderId: "019d6abc-0000-7000-8000-000000000102",
  merchantId: "019d6abc-0000-7000-8000-000000000002",
  ratingId: "019d6abc-0000-7000-8000-000000000103",
  otherRatingId: "019d6abc-0000-7000-8000-000000000104",
} as const;

const ids = ratingMockIds;
type Review = ReturnType<typeof merchantReviewPageOutput.parse>["reviews"][number];
type Rating = ReturnType<typeof orderRatingOutput.parse>;

function problem(status: number, code: string) {
  return HttpResponse.json(
    {
      type: `https://zaafran.invalid/problems/${code}`,
      title: code,
      status,
      code,
      requestId: "mock",
    },
    { status },
  );
}

type MockState = {
  rating: Rating | undefined;
  isWindowClosed: boolean;
  reviews: Review[];
  reports: string[];
};

export function ratingsMockState(): MockState {
  const reviews: Review[] = [
    {
      ratingId: ids.ratingId,
      foodStars: 5,
      deliveryStars: 4,
      comment: "Très bon couscous",
      createdAt: "2027-02-08T20:00:00.000Z",
      reply: null,
    },
    {
      ratingId: ids.otherRatingId,
      foodStars: 2,
      deliveryStars: null,
      comment: null,
      createdAt: "2027-02-07T19:00:00.000Z",
      reply: {
        body: "Merci",
        createdAt: "2027-02-07T20:00:00.000Z",
        editableUntil: "2026-01-01T00:00:00.000Z",
      },
    },
  ];
  return { rating: undefined, isWindowClosed: false, reviews, reports: [] };
}

type State = MockState;

function orderHandlers(state: State) {
  return [
    http.get("*/v1/orders/:orderId/rating", () =>
      state.rating === undefined
        ? new HttpResponse(null, { status: 204 })
        : HttpResponse.json(state.rating),
    ),
    http.put("*/v1/orders/:orderId/rating", async ({ request, params }) => {
      if (state.isWindowClosed) return problem(409, "edit_window_closed");
      const input = orderRatingInput.safeParse(await request.json());
      if (!input.success) return problem(400, "invalid_request");
      state.rating = orderRatingOutput.parse({
        ratingId: ids.ratingId,
        orderId: params.orderId,
        foodStars: input.data.foodStars,
        deliveryStars: input.data.deliveryStars ?? null,
        comment: input.data.comment ?? null,
        createdAt: "2027-02-08T20:00:00.000Z",
        editableUntil: "2027-02-09T20:00:00.000Z",
        reply: null,
      });
      return HttpResponse.json(state.rating);
    }),
  ];
}

function reviewHandlers(state: State) {
  const base = "*/v1/merchants/:merchantId/reviews";
  return [
    http.get(base, ({ request, params }) => {
      if (params.merchantId !== ids.merchantId) return new HttpResponse(null, { status: 404 });
      const stars = new URL(request.url).searchParams.get("stars");
      const reviews = state.reviews.filter(
        (row) => stars === null || String(row.foodStars) === stars,
      );
      return HttpResponse.json(merchantReviewPageOutput.parse({ reviews, nextCursor: null }));
    }),
    http.put(`${base}/:ratingId/reply`, async ({ request, params }) => {
      const input = merchantReviewReplyInput.safeParse(await request.json());
      const review = state.reviews.find((row) => row.ratingId === params.ratingId);
      if (!input.success || review === undefined) return problem(400, "invalid_request");
      const reply = {
        body: input.data.body,
        createdAt: "2027-02-08T21:00:00.000Z",
        editableUntil: "2027-02-09T21:00:00.000Z",
      };
      review.reply = reply;
      return HttpResponse.json(
        merchantReviewReplyOutput.parse({ ratingId: review.ratingId, reply }),
      );
    }),
    http.post(`${base}/:ratingId/report`, async ({ request, params }) => {
      const input = merchantReviewReportInput.safeParse(await request.json());
      if (!input.success || typeof params.ratingId !== "string")
        return problem(400, "invalid_request");
      state.reports.push(params.ratingId);
      return HttpResponse.json(
        merchantReviewReportOutput.parse({
          ratingId: params.ratingId,
          reportedAt: "2027-02-08T21:00:00.000Z",
        }),
      );
    }),
  ];
}

export function ratingsHandlers(state = ratingsMockState()) {
  return [...orderHandlers(state), ...reviewHandlers(state)];
}
