import type { DatabaseConnection } from "@zaafran/db/database";

export async function checkReadiness(database: DatabaseConnection): Promise<void> {
  const [result] = await database.sql<{ ready: boolean }[]>`
    SELECT
      EXISTS (SELECT 1 FROM graphile_worker.migrations WHERE id = 20)
      AND to_regclass('public.job_effects') IS NOT NULL
      AND (
        SELECT count(*) = 3 FROM pg_extension
        WHERE extname IN ('postgis', 'pg_trgm', 'unaccent')
      ) AS ready
  `;
  if (!result?.ready)
    throw new Error("The required application and worker schemas are unavailable.");
}
