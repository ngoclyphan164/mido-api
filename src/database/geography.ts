import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

export type Coordinate = Readonly<{ lat: number; lng: number }>;

/** Convert app-order lat/lng to PostGIS-order longitude/latitude EWKT. */
export function toGeographyPoint({ lat, lng }: Coordinate): string {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError('lat must be a finite number between -90 and 90');
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError('lng must be a finite number between -180 and 180');
  }

  return `SRID=4326;POINT(${lng} ${lat})`;
}

/**
 * The read side of a `geography(Point,4326)` column.
 *
 * PostGIS is installed into the `extensions` schema on Supabase, not `public`,
 * so both the function and the cast target have to stay schema-qualified — an
 * unqualified `ST_Y` resolves only if `extensions` happens to be on the role's
 * search_path, which it is not for the API's connection.
 */
export function geographyLat(column: SQLWrapper): SQL<number> {
  return sql<number>`extensions.ST_Y(${column}::extensions.geometry)::double precision`;
}

export function geographyLng(column: SQLWrapper): SQL<number> {
  return sql<number>`extensions.ST_X(${column}::extensions.geometry)::double precision`;
}
