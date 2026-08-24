import { describe, expect, it } from 'vitest';

import { bayesianQuality, jainFairnessIndex, rankCandidates, scoreCandidate } from './scoring';

describe('midpoint scoring', () => {
  it('Jain = 1 khi bằng nhau hoặc tất cả bằng 0', () => {
    expect(jainFairnessIndex([600, 600, 600])).toBe(1);
    expect(jainFairnessIndex([0, 0])).toBe(1);
    expect(jainFairnessIndex([300, 900])).toBeLessThan(1);
  });

  it('Bayesian average hạ độ tin cậy của quán 5 sao ít review', () => {
    expect(bayesianQuality(5, 3)).toBeLessThan(bayesianQuality(5, 300));
    expect(bayesianQuality()).toBe(0.5);
  });

  it('mọi thành phần và score luôn nằm trong [0,1]', () => {
    const result = scoreCandidate(
      {
        id: 'far',
        travelTimesSeconds: [3_600, 4_000],
        rating: 9,
        userRatingCount: 10,
        preference: 2,
        context: -1,
      },
      'BALANCED',
      1_800,
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.breakdown.efficiency).toBe(0);
    expect(result.breakdown.preference).toBe(1);
    expect(result.breakdown.context).toBe(0);
  });

  it('FAIREST dùng minimax thật, không xếp chỉ bằng Jain index', () => {
    const result = rankCandidates(
      [
        { id: 'equal-but-slower', travelTimesSeconds: [600, 600] },
        { id: 'unequal-but-lower-max', travelTimesSeconds: [100, 500] },
      ],
      'FAIREST',
    );

    expect(result.candidates[0]?.id).toBe('unequal-but-lower-max');
  });

  it('lọc hard cap và chỉ relax khi không còn candidate nào', () => {
    const feasible = rankCandidates(
      [
        { id: 'inside', travelTimesSeconds: [500, 600] },
        { id: 'outside', travelTimesSeconds: [500, 2_000] },
      ],
      'BALANCED',
      1_800,
    );
    expect(feasible.capRelaxed).toBe(false);
    expect(feasible.candidates.map(({ id }) => id)).toEqual(['inside']);

    const relaxed = rankCandidates(
      [{ id: 'outside', travelTimesSeconds: [2_000, 2_100] }],
      'BALANCED',
      1_800,
    );
    expect(relaxed.capRelaxed).toBe(true);
  });

  it('WEIGHTED ưu tiên giảm thời gian của participant có weight cao', () => {
    const highPriorityFar = scoreCandidate(
      { id: 'a', travelTimesSeconds: [900, 300], participantWeights: [1.4, 0.6] },
      'WEIGHTED',
    );
    const highPriorityNear = scoreCandidate(
      { id: 'b', travelTimesSeconds: [300, 900], participantWeights: [1.4, 0.6] },
      'WEIGHTED',
    );

    expect(highPriorityNear.breakdown.meanTimeSeconds).toBeLessThan(
      highPriorityFar.breakdown.meanTimeSeconds,
    );
    expect(highPriorityNear.score).toBeGreaterThan(highPriorityFar.score);
  });
});
