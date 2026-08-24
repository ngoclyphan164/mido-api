import { describe, expect, it } from 'vitest';

import {
  centroid,
  geometricMedian,
  haversineMeters,
  projectToEnu,
  unprojectFromEnu,
} from './geometry';
import { computeMidpointPreview } from './preview';

const hcmFixture = [
  { lat: 10.7756, lng: 106.7019 }, // Q1
  { lat: 10.7844, lng: 106.6844 }, // Q3
  { lat: 10.7298, lng: 106.7215 }, // Q7
  { lat: 10.8014, lng: 106.71 }, // Bình Thạnh
] as const;

describe('midpoint geometry', () => {
  it('haversine đối xứng và bằng 0 với cùng điểm', () => {
    expect(haversineMeters(hcmFixture[0], hcmFixture[0])).toBe(0);
    expect(haversineMeters(hcmFixture[0], hcmFixture[1])).toBeCloseTo(
      haversineMeters(hcmFixture[1], hcmFixture[0]),
      9,
    );
  });

  it('ENU projection round-trip giữ nguyên coordinate trong phạm vi thành phố', () => {
    const origin = centroid(hcmFixture);
    const restored = unprojectFromEnu(projectToEnu(hcmFixture[2], origin), origin);

    expect(restored.lat).toBeCloseTo(hcmFixture[2].lat, 10);
    expect(restored.lng).toBeCloseTo(hcmFixture[2].lng, 10);
  });

  it('Weiszfeld hội tụ với fixture Q1/Q3/Q7/Bình Thạnh', () => {
    const result = geometricMedian(hcmFixture);

    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(100);
    expect(result.point.lat).toBeGreaterThan(10.74);
    expect(result.point.lat).toBeLessThan(10.8);
    expect(result.point.lng).toBeGreaterThan(106.68);
    expect(result.point.lng).toBeLessThan(106.72);
  });

  it('outlier không kéo geometric median mạnh như centroid', () => {
    const outlier = { lat: 11.25, lng: 107.1 };
    const baseMedian = geometricMedian(hcmFixture).point;
    const movedMedian = geometricMedian([...hcmFixture, outlier]).point;
    const baseCentroid = centroid(hcmFixture);
    const movedCentroid = centroid([...hcmFixture, outlier]);

    expect(haversineMeters(baseMedian, movedMedian)).toBeLessThan(
      haversineMeters(baseCentroid, movedCentroid),
    );
  });

  it('weight cao kéo seed về phía participant được ưu tiên', () => {
    const left = { lat: 10.77, lng: 106.68 };
    const right = { lat: 10.77, lng: 106.72 };
    const unweighted = geometricMedian([left, right]).point;
    const weighted = geometricMedian([left, { ...right, weight: 1.4 }]).point;

    expect(haversineMeters(weighted, right)).toBeLessThan(haversineMeters(unweighted, right));
  });

  it('preview clamp radius và đề xuất 2 cluster khi nhóm phân tán trên 25km', () => {
    const closePreview = computeMidpointPreview(hcmFixture);
    expect(closePreview.searchRadiusMeters).toBeGreaterThanOrEqual(800);
    expect(closePreview.searchRadiusMeters).toBeLessThanOrEqual(5_000);

    const splitPreview = computeMidpointPreview([
      hcmFixture[0],
      hcmFixture[1],
      { lat: 11.05, lng: 106.95 },
      { lat: 11.06, lng: 106.96 },
    ]);
    expect(splitPreview.splitSuggestion?.clusters[0]).not.toHaveLength(0);
    expect(splitPreview.splitSuggestion?.clusters[1]).not.toHaveLength(0);
  });
});
