import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { lockMerchantAdmin } from "./merchant-access.js";
import { listCommunes, listPendingApplications } from "./merchant-queries.js";
import {
  lockMerchantCommand,
  recordMerchantCommand,
  type MerchantCommand,
  type MerchantReviewStatus,
} from "./merchant-receipts.js";

interface MerchantApplication {
  readonly restaurantName: string;
  readonly ownerName: string;
  readonly communeId: string;
  readonly pin: { readonly latitude: number; readonly longitude: number };
  readonly cuisines: readonly string[];
  readonly rcNumber?: string | undefined;
}

interface SubmitApplication extends MerchantCommand {
  readonly accountId: string;
  readonly input: MerchantApplication;
  readonly now: Date;
}

type ApplicationResult =
  | {
      readonly kind: "created" | "replayed";
      readonly merchantId: string;
      readonly status: "pending_review";
    }
  | {
      readonly kind:
        "account_unavailable" | "invalid_commune" | "outside_commune" | "idempotency_conflict";
    };

interface ReviewApplication extends MerchantCommand {
  readonly adminUserId: string;
  readonly merchantId: string;
  readonly decision: "approve" | "reject";
  readonly reason: string;
  readonly now: Date;
}

type ReviewResult =
  | {
      readonly kind: "reviewed" | "replayed";
      readonly merchantId: string;
      readonly status: MerchantReviewStatus;
      readonly reviewedAt: Date;
    }
  | { readonly kind: "forbidden" | "not_found" | "invalid_status" | "idempotency_conflict" };

type MerchantStatus = "pending_review" | MerchantReviewStatus | "active" | "paused" | "suspended";
type MerchantRole = "owner" | "manager" | "staff";

interface Membership {
  readonly merchantId: string;
  readonly restaurantName: string;
  readonly status: MerchantStatus;
  readonly role: MerchantRole;
}

async function findEligibleCommune(sql: TransactionSql, input: MerchantApplication) {
  const { communeId, pin } = input;
  const [commune] = await sql<{ covers: boolean }[]>`
    SELECT ST_Covers(boundary, ST_SetSRID(ST_MakePoint(${pin.longitude}, ${pin.latitude}), 4326)) AS covers
    FROM public.communes WHERE id = ${communeId} AND wilaya_code = 16 AND boundary IS NOT NULL
    FOR SHARE
  `;
  return commune;
}

async function insertApplication(
  sql: TransactionSql,
  request: SubmitApplication,
  phone: string,
): Promise<string> {
  const { accountId, input, now } = request;
  const { restaurantName, ownerName, communeId, pin, cuisines, rcNumber } = input;
  const createdAt = now.toISOString();
  const [merchant] = await sql<{ id: string }[]>`
    WITH new_merchant AS (SELECT uuidv7() AS id)
    INSERT INTO public.merchants
      (id, slug, restaurant_name, owner_name, phone_e164, commune_id, location,
       cuisines, rc_number, status, created_at)
    SELECT id, 'restaurant-' || id::text, ${restaurantName}, ${ownerName}, ${phone}, ${communeId},
      ST_SetSRID(ST_MakePoint(${pin.longitude}, ${pin.latitude}), 4326)::geography,
      ${[...cuisines]}, ${rcNumber ?? null}, 'pending_review', ${createdAt}::timestamptz
    FROM new_merchant
    RETURNING id
  `;
  if (!merchant) throw new Error("Merchant application insert returned no row.");
  await sql`
    INSERT INTO public.merchant_members (merchant_id, user_id, role)
    VALUES (${merchant.id}, ${accountId}, 'owner')
  `;
  await sql`
    INSERT INTO public.merchant_review_notices (merchant_id, created_at)
    VALUES (${merchant.id}, ${createdAt}::timestamptz)
  `;
  return merchant.id;
}

async function submitApplication(
  sql: TransactionSql,
  request: SubmitApplication,
): Promise<ApplicationResult> {
  const { accountId, input, now } = request;
  const [account] = await sql<{ id: string; phone: string }[]>`
    SELECT id, phone_e164 AS phone FROM public.users
    WHERE id = ${accountId} AND blocked_at IS NULL AND deleted_at IS NULL FOR SHARE
  `;
  if (!account) return { kind: "account_unavailable" };

  const identity = { ...request, actorId: account.id, operation: "application" as const };
  const receipt = await lockMerchantCommand(sql, identity);
  const status = "pending_review";
  if (receipt) {
    return receipt.requestMatches
      ? { kind: "replayed", merchantId: receipt.merchantId, status }
      : { kind: "idempotency_conflict" };
  }

  const commune = await findEligibleCommune(sql, input);
  if (!commune) return { kind: "invalid_commune" };
  if (!commune.covers) return { kind: "outside_commune" };

  const merchantId = await insertApplication(sql, request, account.phone);
  await recordMerchantCommand(sql, identity, { merchantId, status, at: now });
  return { kind: "created", merchantId, status };
}

async function reviewApplication(
  sql: TransactionSql,
  request: ReviewApplication,
): Promise<ReviewResult> {
  const { adminUserId, merchantId, decision, reason, now } = request;
  const actorId = await lockMerchantAdmin(sql, adminUserId);
  if (!actorId) return { kind: "forbidden" };

  const identity = { ...request, actorId, operation: "review" as const };
  const receipt = await lockMerchantCommand(sql, identity);
  if (receipt) {
    if (!receipt.requestMatches) return { kind: "idempotency_conflict" };
    if (receipt.status === "pending_review") throw new Error("Invalid merchant review receipt.");
    return {
      kind: "replayed",
      merchantId: receipt.merchantId,
      status: receipt.status,
      reviewedAt: receipt.recordedAt,
    };
  }

  const status = decision === "approve" ? "approved" : "rejected";
  const [merchant] = await sql`
    UPDATE public.merchants SET status = ${status}, reviewed_at = ${now.toISOString()}::timestamptz
    WHERE id = ${merchantId} AND status = 'pending_review' RETURNING id
  `;
  if (!merchant) {
    const [existing] = await sql`SELECT id FROM public.merchants WHERE id = ${merchantId}`;
    return { kind: existing ? "invalid_status" : "not_found" };
  }

  await sql`
    INSERT INTO public.audit_log (actor_id, merchant_id, action, reason, created_at)
    VALUES (${actorId}, ${merchantId}, ${"merchant_" + status}, ${reason}, ${now.toISOString()}::timestamptz)
  `;
  await recordMerchantCommand(sql, identity, { merchantId, status, at: now });
  return { kind: "reviewed", merchantId, status, reviewedAt: now };
}

export function createMerchantRepository({ sql }: DatabaseConnection) {
  return {
    listCommunes: (page: Parameters<typeof listCommunes>[1]) => listCommunes(sql, page),
    listPendingApplications: (page: Parameters<typeof listPendingApplications>[1]) =>
      sql.begin((tx) => listPendingApplications(tx, page)),
    submitApplication: (request: SubmitApplication) =>
      sql.begin((tx) => submitApplication(tx, request)),
    reviewApplication: (request: ReviewApplication) =>
      sql.begin((tx) => reviewApplication(tx, request)),
    async listMemberships({ accountId }: { accountId: string }) {
      return sql<Membership[]>`
        SELECT merchants.id AS "merchantId", restaurant_name AS "restaurantName", status, role
        FROM public.merchant_members JOIN public.merchants ON merchants.id = merchant_id
        WHERE user_id = ${accountId} ORDER BY merchants.created_at, merchants.id
      `;
    },
    async findManagedMerchant({
      accountId,
      merchantId,
    }: {
      accountId: string;
      merchantId: string;
    }) {
      const [merchant] = await sql<Membership[]>`
        SELECT merchants.id AS "merchantId", restaurant_name AS "restaurantName", status, role
        FROM public.merchant_members JOIN public.merchants ON merchants.id = merchant_id
        WHERE user_id = ${accountId} AND merchant_id = ${merchantId} AND role IN ('owner', 'manager')
      `;
      return merchant;
    },
  };
}
