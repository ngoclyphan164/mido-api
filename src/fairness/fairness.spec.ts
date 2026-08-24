import { describe, expect, it } from 'vitest';

import { calculateFairnessDeltas, fairnessPriorityWeight } from './fairness';

describe('calculateFairnessDeltas', () => {
  it('ghi debt dương cho người đi lâu hơn và bảo toàn tổng bằng 0', () => {
    const result = calculateFairnessDeltas([
      { participantId: 'b', userId: 'user-b', durationSeconds: 1_200 },
      { participantId: 'a', userId: 'user-a', durationSeconds: 600 },
      { participantId: 'c', userId: 'user-c', durationSeconds: 601 },
    ]);

    expect(result.meanDurationSeconds).toBeCloseTo(800.333, 3);
    expect(result.entries.find((entry) => entry.participantId === 'b')?.deltaSeconds).toBe(400);
    expect(result.entries.reduce((sum, entry) => sum + entry.deltaSeconds, 0)).toBe(0);
  });

  it('không phụ thuộc thứ tự input khi sửa sai số làm tròn', () => {
    const input = [
      { participantId: 'a', userId: 'user-a', durationSeconds: 0 },
      { participantId: 'b', userId: 'user-b', durationSeconds: 0 },
      { participantId: 'c', userId: 'user-c', durationSeconds: 1 },
    ];

    const first = calculateFairnessDeltas(input)
      .entries.map(({ participantId, deltaSeconds }) => ({ participantId, deltaSeconds }))
      .sort((left, right) => left.participantId.localeCompare(right.participantId));
    const second = calculateFairnessDeltas([...input].reverse())
      .entries.map(({ participantId, deltaSeconds }) => ({ participantId, deltaSeconds }))
      .sort((left, right) => left.participantId.localeCompare(right.participantId));

    expect(second).toEqual(first);
    expect(first.reduce((sum, entry) => sum + entry.deltaSeconds, 0)).toBe(0);
  });
});

describe('fairnessPriorityWeight', () => {
  it('ưu tiên debt dương và chặn adjustment ở ±40%', () => {
    expect(fairnessPriorityWeight(0)).toBe(1);
    expect(fairnessPriorityWeight(1_800)).toBe(1.4);
    expect(fairnessPriorityWeight(-1_800)).toBe(0.6);
    expect(fairnessPriorityWeight(99_999)).toBe(1.4);
    expect(fairnessPriorityWeight(-99_999)).toBe(0.6);
  });
});
