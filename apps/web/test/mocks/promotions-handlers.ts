import {
  merchantPromotionInput,
  merchantPromotionListOutput,
  merchantPromotionOutput,
} from "@zaafran/contracts/promotions";
import { http, HttpResponse } from "msw";

export const promotionMockIds = {
  merchantId: "019d6abc-0000-7000-8000-000000000002",
  promotionId: "019d6abc-0000-7000-8000-000000000201",
  createdId: "019d6abc-0000-7000-8000-000000000202",
  sessionId: "019d6abc-0000-7000-8000-000000000001",
} as const;

const ids = promotionMockIds;
type Promotion = ReturnType<typeof merchantPromotionOutput.parse>;

export function promotionsMockState(): { promotions: Promotion[] } {
  return {
    promotions: [
      merchantPromotionOutput.parse({
        promotionId: ids.promotionId,
        merchantId: ids.merchantId,
        activation: { kind: "code", code: "IFTAR" },
        discount: { kind: "percent", basisPoints: 1000, capDzd: 300 },
        conditions: { minimumSubtotalDzd: 1500 },
        stats: { uses: 42, salesDzd: 98_500 },
      }),
    ],
  };
}

export function promotionsHandlers(state = promotionsMockState()) {
  const base = "*/v1/merchants/:merchantId/promotions";
  const isTaken = (code: string, exceptId?: string) =>
    state.promotions.some(
      (row) =>
        row.activation.kind === "code" &&
        row.activation.code === code &&
        row.promotionId !== exceptId,
    );
  const problem = (code: string) =>
    HttpResponse.json(
      {
        type: `https://zaafran.invalid/problems/${code}`,
        title: code,
        status: 409,
        code,
        requestId: "mock",
      },
      { status: 409 },
    );
  async function upsert(request: Request, promotionId: string) {
    if (request.headers.get("x-expected-session-id") !== ids.sessionId)
      return problem("session_changed");
    const input = merchantPromotionInput.safeParse(await request.json());
    if (!input.success) return HttpResponse.json({ code: "invalid_request" }, { status: 400 });
    if (input.data.activation.kind === "code" && isTaken(input.data.activation.code, promotionId)) {
      return problem("promotion_code_taken");
    }
    const existing = state.promotions.find((row) => row.promotionId === promotionId);
    const promotion = merchantPromotionOutput.parse({
      ...input.data,
      promotionId,
      merchantId: ids.merchantId,
      stats: existing?.stats ?? { uses: 0, salesDzd: 0 },
    });
    state.promotions = [
      promotion,
      ...state.promotions.filter((row) => row.promotionId !== promotionId),
    ];
    return HttpResponse.json(promotion, { status: existing === undefined ? 201 : 200 });
  }
  return [
    http.get(base, ({ params }) =>
      params.merchantId === ids.merchantId
        ? HttpResponse.json(
            merchantPromotionListOutput.parse({
              sessionId: ids.sessionId,
              promotions: state.promotions,
            }),
          )
        : new HttpResponse(null, { status: 404 }),
    ),
    http.post(base, ({ request }) => upsert(request, ids.createdId)),
    http.put(`${base}/:promotionId`, ({ request, params }) =>
      typeof params.promotionId === "string"
        ? upsert(request, params.promotionId)
        : new HttpResponse(null, { status: 404 }),
    ),
  ];
}
