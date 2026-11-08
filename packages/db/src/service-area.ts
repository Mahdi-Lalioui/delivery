import type { DatabaseConnection } from "./database.ts";

type PointLookup = { kind: "point"; latitude: number; longitude: number };
type CommuneLookup = { kind: "commune"; communeId: string };

type ResolvedLocation = {
  latitude: number;
  longitude: number;
  communeId: string | null;
  serviceAreaId: string | null;
};

function locatePoint(sql: DatabaseConnection["sql"], { latitude, longitude }: PointLookup) {
  return sql`
    SELECT position.point, commune.id AS commune_id
    FROM (SELECT ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326) AS point) AS position
    LEFT JOIN LATERAL (
      SELECT id FROM public.communes
      WHERE boundary IS NOT NULL AND ST_Covers(boundary, position.point)
      ORDER BY code LIMIT 1
    ) AS commune ON true
  `;
}

function locateCommune(sql: DatabaseConnection["sql"], { communeId }: CommuneLookup) {
  return sql`
    SELECT id AS commune_id,
      CASE WHEN boundary IS NOT NULL AND NOT ST_Covers(boundary, centroid::geometry)
        THEN ST_PointOnSurface(boundary)
        ELSE centroid::geometry
      END AS point
    FROM public.communes WHERE id = ${communeId}::uuid
  `;
}

export function createServiceAreaRepository({ sql }: DatabaseConnection) {
  return {
    async resolve(input: PointLookup | CommuneLookup): Promise<ResolvedLocation | undefined> {
      const position = input.kind === "point" ? locatePoint(sql, input) : locateCommune(sql, input);
      const [row] = await sql<ResolvedLocation[]>`
        SELECT ST_Y(position.point) AS latitude, ST_X(position.point) AS longitude,
          position.commune_id AS "communeId", area.id AS "serviceAreaId"
        FROM (${position}) AS position
        LEFT JOIN LATERAL (
          SELECT id FROM public.service_areas
          WHERE active AND ST_Covers(polygon, position.point::geography)
          ORDER BY id LIMIT 1
        ) AS area ON true
      `;
      return row;
    },
  };
}
