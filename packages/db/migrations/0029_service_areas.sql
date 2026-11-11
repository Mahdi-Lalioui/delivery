CREATE TABLE public.service_areas (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  city text NOT NULL CHECK (btrim(city) <> ''),
  polygon geography(MultiPolygon, 4326) NOT NULL,
  active boolean NOT NULL DEFAULT false,
  CHECK (NOT ST_IsEmpty(polygon::geometry) AND ST_IsValid(polygon::geometry))
);
--> statement-breakpoint
CREATE INDEX service_areas_active_polygon_idx ON public.service_areas USING gist (polygon)
  WHERE active;
--> statement-breakpoint
CREATE INDEX communes_boundary_idx ON public.communes USING gist (boundary)
  WHERE boundary IS NOT NULL;
