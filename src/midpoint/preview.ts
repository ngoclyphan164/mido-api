import {
  centroid,
  geometricMedian,
  haversineMeters,
  maxPairwiseDistanceMeters,
  projectToEnu,
  unprojectFromEnu,
  type Coordinate,
  type WeightedCoordinate,
} from './geometry';

export type MidpointPreview = {
  seed: Coordinate;
  converged: boolean;
  iterations: number;
  searchRadiusMeters: number;
  maxDistanceToSeedMeters: number;
  spreadMeters: number;
  splitSuggestion?: { clusters: [number[], number[]]; seeds: [Coordinate, Coordinate] };
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function splitKMeans2(points: readonly Coordinate[]): MidpointPreview['splitSuggestion'] {
  let farthest: [number, number] = [0, 1];
  let farthestDistance = -1;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const a = points[left];
      const b = points[right];
      if (!a || !b) continue;
      const distance = haversineMeters(a, b);
      if (distance > farthestDistance) {
        farthest = [left, right];
        farthestDistance = distance;
      }
    }
  }

  const origin = centroid(points);
  const vectors = points.map((point) => projectToEnu(point, origin));
  let centers: [ReturnType<typeof projectToEnu>, ReturnType<typeof projectToEnu>] = [
    vectors[farthest[0]]!,
    vectors[farthest[1]]!,
  ];
  let assignments = new Array<number>(points.length).fill(-1);

  for (let iteration = 0; iteration < 50; iteration += 1) {
    const nextAssignments = vectors.map((point) => {
      const first = centers[0];
      const second = centers[1];
      if (!first || !second) return 0;
      return Math.hypot(point.x - first.x, point.y - first.y) <=
        Math.hypot(point.x - second.x, point.y - second.y)
        ? 0
        : 1;
    });
    if (nextAssignments.every((value, index) => value === assignments[index])) break;
    assignments = nextAssignments;

    const recompute = (cluster: number) => {
      const members = vectors.filter((_point, index) => assignments[index] === cluster);
      if (members.length === 0) return centers[cluster] ?? { x: 0, y: 0 };
      return {
        x: members.reduce((sum, point) => sum + point.x, 0) / members.length,
        y: members.reduce((sum, point) => sum + point.y, 0) / members.length,
      };
    };
    centers = [recompute(0), recompute(1)];
  }

  const clusters: [number[], number[]] = [[], []];
  assignments.forEach((cluster, index) => clusters[cluster === 1 ? 1 : 0].push(index));
  return {
    clusters,
    seeds: [unprojectFromEnu(centers[0], origin), unprojectFromEnu(centers[1], origin)],
  };
}

export function computeMidpointPreview(
  participants: readonly WeightedCoordinate[],
  splitThresholdMeters = 25_000,
): MidpointPreview {
  if (participants.length < 2) throw new RangeError('at least two participants are required');

  const median = geometricMedian(participants);
  const distances = participants.map((point) => haversineMeters(point, median.point));
  const maxDistanceToSeedMeters = Math.max(...distances);
  const spreadMeters = maxPairwiseDistanceMeters(participants);

  return {
    seed: median.point,
    converged: median.converged,
    iterations: median.iterations,
    searchRadiusMeters: clamp(maxDistanceToSeedMeters * 0.35, 800, 5_000),
    maxDistanceToSeedMeters,
    spreadMeters,
    splitSuggestion:
      spreadMeters > splitThresholdMeters && participants.length >= 4
        ? splitKMeans2(participants)
        : undefined,
  };
}
