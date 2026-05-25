import { describe, it, expect } from 'vitest';
import { computeSessionTotals } from '../utils/fitStats';
import type { FitRecord } from '../types/fit';

const t = (s: number) => new Date(2026, 0, 1, 9, 0, s);

describe('computeSessionTotals', () => {
  it('returns zeros for an empty record stream', () => {
    const result = computeSessionTotals([]);
    expect(result.total_elapsed_time).toBe(0);
    expect(result.total_timer_time).toBe(0);
    expect(result.total_distance).toBe(0);
    expect(result.avg_heart_rate).toBeUndefined();
    expect(result.max_heart_rate).toBeUndefined();
  });

  it('returns zero duration and distance for a single record', () => {
    const records: FitRecord[] = [
      { timestamp: t(0), distance: 100, heart_rate: 120 },
    ];
    const result = computeSessionTotals(records);
    expect(result.total_elapsed_time).toBe(0);
    expect(result.total_distance).toBe(0);
    expect(result.avg_heart_rate).toBe(120);
    expect(result.max_heart_rate).toBe(120);
  });
});
