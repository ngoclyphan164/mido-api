import { describe, expect, it } from 'vitest';

import { haversineMeters } from '../midpoint/geometry';
import { snapToGrid } from './grid';

describe('snapToGrid', () => {
  it('gom các điểm gần nhau vào cùng cell 250m', () => {
    const first = snapToGrid({ lat: 10.7756, lng: 106.7019 });
    const second = snapToGrid({ lat: 10.77562, lng: 106.70192 });

    expect(first.cell).toBe(second.cell);
    expect(haversineMeters(first.point, second.point)).toBe(0);
  });

  it('giữ tâm snapped cách điểm gốc trong biên hợp lý', () => {
    const original = { lat: 10.7756, lng: 106.7019 };
    const snapped = snapToGrid(original);

    expect(haversineMeters(original, snapped.point)).toBeLessThan(180);
  });
});
