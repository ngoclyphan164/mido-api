export type Coordinate = Readonly<{ lat: number; lng: number }>;
export type WeightedCoordinate = Coordinate & Readonly<{ weight?: number }>;

export type GeometricMedianResult = {
  point: Coordinate;
  iterations: number;
  converged: boolean;
};

type Vector2 = { x: number; y: number };

const EARTH_RADIUS_METERS = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function assertCoordinate(point: Coordinate): void {
  if (!Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) {
    throw new RangeError('lat must be a finite number between -90 and 90');
  }
  if (!Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180) {
    throw new RangeError('lng must be a finite number between -180 and 180');
  }
}

function distance2d(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function haversineMeters(a: Coordinate, b: Coordinate): number {
  assertCoordinate(a);
  assertCoordinate(b);

  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const deltaLat = (b.lat - a.lat) * DEG_TO_RAD;
  const deltaLng = (b.lng - a.lng) * DEG_TO_RAD;
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Spherical centroid, used only as a stable local projection origin. */
export function centroid(points: readonly Coordinate[]): Coordinate {
  if (points.length === 0) throw new RangeError('at least one coordinate is required');

  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    assertCoordinate(point);
    const lat = point.lat * DEG_TO_RAD;
    const lng = point.lng * DEG_TO_RAD;
    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
  }

  const horizontal = Math.hypot(x, y);
  if (horizontal < Number.EPSILON && Math.abs(z) < Number.EPSILON) {
    throw new RangeError('centroid is undefined for antipodal coordinates');
  }

  return {
    lat: Math.atan2(z, horizontal) * RAD_TO_DEG,
    lng: Math.atan2(y, x) * RAD_TO_DEG,
  };
}

export function projectToEnu(point: Coordinate, origin: Coordinate): Vector2 {
  assertCoordinate(point);
  assertCoordinate(origin);
  const originLat = origin.lat * DEG_TO_RAD;

  return {
    x: EARTH_RADIUS_METERS * (point.lng - origin.lng) * DEG_TO_RAD * Math.cos(originLat),
    y: EARTH_RADIUS_METERS * (point.lat - origin.lat) * DEG_TO_RAD,
  };
}

export function unprojectFromEnu(point: Vector2, origin: Coordinate): Coordinate {
  assertCoordinate(origin);
  const originLat = origin.lat * DEG_TO_RAD;
  const cosOrigin = Math.cos(originLat);
  if (Math.abs(cosOrigin) < 1e-12) throw new RangeError('ENU projection is unstable at the poles');

  return {
    lat: origin.lat + (point.y / EARTH_RADIUS_METERS) * RAD_TO_DEG,
    lng: origin.lng + (point.x / (EARTH_RADIUS_METERS * cosOrigin)) * RAD_TO_DEG,
  };
}

/** Modified Weiszfeld, including the case where an iterate lands on an input point. */
export function geometricMedian(
  points: readonly WeightedCoordinate[],
  options: Readonly<{ maxIterations?: number; toleranceMeters?: number }> = {},
): GeometricMedianResult {
  if (points.length === 0) throw new RangeError('at least one coordinate is required');
  const maxIterations = options.maxIterations ?? 100;
  const toleranceMeters = options.toleranceMeters ?? 0.1;
  if (!Number.isInteger(maxIterations) || maxIterations < 1) {
    throw new RangeError('maxIterations must be a positive integer');
  }
  if (!Number.isFinite(toleranceMeters) || toleranceMeters <= 0) {
    throw new RangeError('toleranceMeters must be positive');
  }

  const origin = centroid(points);
  const projected = points.map((point) => {
    const weight = point.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) throw new RangeError('weights must be positive');
    return { ...projectToEnu(point, origin), weight };
  });

  const totalWeight = projected.reduce((sum, point) => sum + point.weight, 0);
  let current = projected.reduce(
    (sum, point) => ({
      x: sum.x + (point.x * point.weight) / totalWeight,
      y: sum.y + (point.y * point.weight) / totalWeight,
    }),
    { x: 0, y: 0 },
  );

  const singularityMeters = 1e-9;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    let numeratorX = 0;
    let numeratorY = 0;
    let denominator = 0;
    let coincidentWeight = 0;

    for (const point of projected) {
      const distance = distance2d(current, point);
      if (distance <= singularityMeters) {
        coincidentWeight += point.weight;
      } else {
        const factor = point.weight / distance;
        numeratorX += point.x * factor;
        numeratorY += point.y * factor;
        denominator += factor;
      }
    }

    if (denominator === 0) {
      return { point: unprojectFromEnu(current, origin), iterations: iteration, converged: true };
    }

    const weiszfeld = { x: numeratorX / denominator, y: numeratorY / denominator };
    let next = weiszfeld;

    if (coincidentWeight > 0) {
      const residual = {
        x: denominator * (weiszfeld.x - current.x),
        y: denominator * (weiszfeld.y - current.y),
      };
      const residualNorm = Math.hypot(residual.x, residual.y);
      if (residualNorm <= coincidentWeight) {
        return { point: unprojectFromEnu(current, origin), iterations: iteration, converged: true };
      }
      const blend = coincidentWeight / residualNorm;
      next = {
        x: blend * current.x + (1 - blend) * weiszfeld.x,
        y: blend * current.y + (1 - blend) * weiszfeld.y,
      };
    }

    const movement = distance2d(current, next);
    current = next;
    if (movement <= toleranceMeters) {
      return { point: unprojectFromEnu(current, origin), iterations: iteration, converged: true };
    }
  }

  return {
    point: unprojectFromEnu(current, origin),
    iterations: maxIterations,
    converged: false,
  };
}

export function maxPairwiseDistanceMeters(points: readonly Coordinate[]): number {
  let maximum = 0;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const a = points[left];
      const b = points[right];
      if (a && b) maximum = Math.max(maximum, haversineMeters(a, b));
    }
  }
  return maximum;
}
