import type { Coordinate } from '../midpoint/geometry';

const EARTH_RADIUS_METERS = 6_378_137;
const MAX_MERCATOR_LATITUDE = 85.05112878;

export type SnappedGridPoint = {
  point: Coordinate;
  cell: string;
};

export function snapToGrid(point: Coordinate, gridSizeMeters = 250): SnappedGridPoint {
  if (!Number.isFinite(gridSizeMeters) || gridSizeMeters <= 0) {
    throw new RangeError('gridSizeMeters must be positive');
  }

  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, point.lat));
  const longitudeRadians = (point.lng * Math.PI) / 180;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const x = EARTH_RADIUS_METERS * longitudeRadians;
  const y = EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2));
  const cellX = Math.round(x / gridSizeMeters);
  const cellY = Math.round(y / gridSizeMeters);
  const snappedX = cellX * gridSizeMeters;
  const snappedY = cellY * gridSizeMeters;

  return {
    cell: `${gridSizeMeters}:${cellX}:${cellY}`,
    point: {
      lat: (Math.atan(Math.sinh(snappedY / EARTH_RADIUS_METERS)) * 180) / Math.PI,
      lng: (snappedX / EARTH_RADIUS_METERS) * (180 / Math.PI),
    },
  };
}
