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
