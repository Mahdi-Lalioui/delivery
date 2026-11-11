import type { addressInput, addressOutput } from "@zaafran/contracts/addresses";
import type { ISql, TransactionSql } from "postgres";
import type { z } from "zod";
import { addressPlusCode } from "./address-plus-code.js";
import type { DatabaseConnection } from "./database.js";

type AddressInput = z.infer<typeof addressInput>;
type Address = z.infer<typeof addressOutput>;
type SaveResult =
  | { kind: "saved"; address: Address }
  | { kind: "missing" | "outside_service_area" | "voice_note_unavailable" };

function addressProjection(sql: ISql) {
  return sql`jsonb_build_object(
    'addressId', id, 'label', label, 'communeId', commune_id, 'plusCode', plus_code,
    'isDefault', is_default,
    'pin', jsonb_build_object('latitude', ST_Y(location::geometry), 'longitude', ST_X(location::geometry))
  ) || jsonb_strip_nulls(jsonb_build_object(
    'building', building, 'floor', floor, 'apartment', apartment,
    'landmark', landmark, 'instructions', instructions
  ))`;
}

export async function listAddresses(sql: ISql, userId: string): Promise<Address[]> {
  const rows = await sql<{ address: Address }[]>`
    SELECT ${addressProjection(sql)} AS address
    FROM public.addresses WHERE user_id = ${userId}
    ORDER BY is_default DESC, id DESC
  `;
  return rows.map(({ address }) => address);
}

async function lockAccount(sql: TransactionSql, userId: string) {
  const [account] = await sql`
    SELECT id FROM public.users WHERE id = ${userId} AND deleted_at IS NULL AND blocked_at IS NULL
    FOR UPDATE
  `;
  return Boolean(account);
}

function addressPoint(sql: TransactionSql, { latitude, longitude }: AddressInput["pin"]) {
  return sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;
}

async function resolveAddress(sql: TransactionSql, pin: AddressInput["pin"]) {
  const point = addressPoint(sql, pin);
  const [row] = await sql<{ communeId: string | null }[]>`
    SELECT (
      SELECT id FROM public.communes
      WHERE boundary IS NOT NULL AND ST_Covers(boundary, ${point})
      ORDER BY code LIMIT 1
    ) AS "communeId"
    WHERE EXISTS (
      SELECT FROM public.service_areas WHERE active AND ST_Covers(polygon, ${point}::geography)
    )
  `;
  return row;
}

async function setDefault(sql: TransactionSql, userId: string, requested: boolean) {
  if (requested) {
    await sql`UPDATE public.addresses SET is_default = false WHERE user_id = ${userId} AND is_default`;
    return true;
  }
  const [existing] =
    await sql`SELECT FROM public.addresses WHERE user_id = ${userId} AND is_default`;
  return existing === undefined;
}

function addressValues(input: AddressInput, communeId: string | null, isDefault: boolean) {
  return {
    label: input.label,
    plus_code: addressPlusCode(input.pin.latitude, input.pin.longitude),
    commune_id: communeId,
    building: input.building ?? null,
    floor: input.floor ?? null,
    apartment: input.apartment ?? null,
    landmark: input.landmark ?? null,
    instructions: input.instructions ?? null,
    is_default: isDefault,
  };
}

type AddressScope = { userId: string; addressId?: string };

async function writeAddress(
  sql: TransactionSql,
  scope: AddressScope,
  input: AddressInput,
): Promise<SaveResult> {
  const { userId, addressId } = scope;
  if (!(await lockAccount(sql, userId))) return { kind: "missing" };
  const [previous] = addressId
    ? await sql<{ isDefault: boolean }[]>`
        SELECT is_default AS "isDefault" FROM public.addresses WHERE user_id = ${userId} AND id = ${addressId}`
    : [];
  if (addressId && !previous) return { kind: "missing" };
  if (input.voiceMediaId) return { kind: "voice_note_unavailable" };

  const resolved = await resolveAddress(sql, input.pin);
  if (!resolved) return { kind: "outside_service_area" };

  const { latitude, longitude } = input.pin;
  const isDefault =
    previous?.isDefault || (await setDefault(sql, userId, input.isDefault === true));
  const values = {
    ...addressValues(input, resolved.communeId, isDefault),
    location: `SRID=4326;POINT(${String(longitude)} ${String(latitude)})`,
  };
  return persistAddress(sql, scope, values);
}

async function persistAddress(
  sql: TransactionSql,
  { userId, addressId }: AddressScope,
  values: ReturnType<typeof addressValues> & { location: string },
): Promise<SaveResult> {
  const [row] = addressId
    ? await sql<{ address: Address }[]>`
        UPDATE public.addresses SET ${sql(values)}
        WHERE user_id = ${userId} AND id = ${addressId} RETURNING ${addressProjection(sql)} AS address`
    : await sql<{ address: Address }[]>`
        INSERT INTO public.addresses ${sql({ ...values, user_id: userId })}
        RETURNING ${addressProjection(sql)} AS address`;
  return row ? { kind: "saved", address: row.address } : { kind: "missing" };
}

async function removeAddress(sql: TransactionSql, userId: string, addressId: string) {
  if (!(await lockAccount(sql, userId))) return false;
  const [removed] = await sql<{ wasDefault: boolean }[]>`
    DELETE FROM public.addresses WHERE user_id = ${userId} AND id = ${addressId}
    RETURNING is_default AS "wasDefault"
  `;
  if (removed?.wasDefault) {
    await sql`
      UPDATE public.addresses SET is_default = true WHERE id = (
        SELECT id FROM public.addresses WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1
      )
    `;
  }
  return removed !== undefined;
}

export function createAddressRepository({ sql }: DatabaseConnection) {
  return {
    list: (userId: string) => listAddresses(sql, userId),
    create: (userId: string, input: AddressInput) =>
      sql.begin((tx) => writeAddress(tx, { userId }, input)),
    update: (userId: string, addressId: string, input: AddressInput) =>
      sql.begin((tx) => writeAddress(tx, { userId, addressId }, input)),
    remove: (userId: string, addressId: string) =>
      sql.begin((tx) => removeAddress(tx, userId, addressId)),
  };
}
