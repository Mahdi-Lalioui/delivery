import type { TransactionSql } from "postgres";
import type { DatabaseConnection } from "./database.js";
import { lockReadyPhotos } from "./media-access.js";
import { readMenuContext, type MenuScope } from "./menu-access.js";
import { runMenuCommand, type CommandChange, type CommandRequest } from "./menu-commands.js";

interface ProfilePhotoIds {
  readonly coverPhotoId: string | null;
  readonly logoPhotoId: string | null;
}

interface SavedProfilePhotos extends ProfilePhotoIds {
  readonly restaurantName: string;
}

type ProfileWrite = CommandRequest<ProfilePhotoIds & { readonly expectedRevision: number }>;

const photoFields = { cover: "coverPhotoId", logo: "logoPhotoId" } as const;

async function readPhotoIds(sql: TransactionSql, merchantId: string) {
  const [photos] = await sql<ProfilePhotoIds[]>`
    SELECT cover_photo_id AS "coverPhotoId", logo_photo_id AS "logoPhotoId"
    FROM public.merchants WHERE id = ${merchantId}
  `;
  return photos;
}

async function readProfilePhotos(sql: TransactionSql, scope: MenuScope) {
  const menu = await readMenuContext(sql, scope);
  if (!menu) return undefined;
  const photos = await readPhotoIds(sql, scope.merchantId);
  return photos && { ...menu, ...photos };
}

async function replaceProfilePhotos(
  sql: TransactionSql,
  { accountId, merchantId, input }: ProfileWrite,
): Promise<CommandChange<SavedProfilePhotos, "not_found" | "photos_unavailable">> {
  const saved = await readPhotoIds(sql, merchantId);
  if (!saved) return { kind: "not_found" };

  for (const kind of ["cover", "logo"] as const) {
    const field = photoFields[kind];
    const photoId = input[field];
    if (photoId === null || photoId.toLowerCase() === saved[field]) continue;
    if (!(await lockReadyPhotos(sql, { accountId, merchantId, kind, photoIds: [photoId] })))
      return { kind: "photos_unavailable" };
  }

  const [profile] = await sql<SavedProfilePhotos[]>`
    UPDATE public.merchants SET cover_photo_id = ${input.coverPhotoId}, logo_photo_id = ${input.logoPhotoId}
    WHERE id = ${merchantId}
    RETURNING restaurant_name AS "restaurantName", cover_photo_id AS "coverPhotoId", logo_photo_id AS "logoPhotoId"
  `;
  if (!profile) throw new Error("Profile photo update returned no row.");
  return { kind: "changed", value: profile };
}

export function createMerchantProfilePhotosRepository({ sql }: DatabaseConnection) {
  return {
    read: (scope: MenuScope) =>
      sql.begin("isolation level repeatable read read only", (tx) => readProfilePhotos(tx, scope)),
    write: (request: ProfileWrite) =>
      sql.begin((tx) =>
        runMenuCommand(tx, request, {
          operation: "profile_photos_replace",
          apply: () => replaceProfilePhotos(tx, request),
        }),
      ),
  };
}
