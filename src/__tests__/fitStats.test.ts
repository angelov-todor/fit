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

describe('computeSessionTotals — avg/max metrics', () => {
  it('computes avg/max for cadence, power, speed; ignores undefined gaps', () => {
    const records: FitRecord[] = [
      { timestamp: t(0), distance: 0,   cadence: 80,  power: 200, speed: 5 },
      { timestamp: t(1), distance: 5,   cadence: undefined, power: 220, speed: 6 },
      { timestamp: t(2), distance: 11,  cadence: 90,  power: 240, speed: 7 },
      { timestamp: t(3), distance: 18,  cadence: 100, power: undefined, speed: 8 },
    ];
    const result = computeSessionTotals(records);

    expect(result.avg_cadence).toBe(90);        // (80+90+100)/3 rounded
    expect(result.max_cadence).toBe(100);
    expect(result.avg_power).toBe(220);         // (200+220+240)/3
    expect(result.max_power).toBe(240);
    expect(result.avg_speed).toBeCloseTo(6.5);
    expect(result.max_speed).toBe(8);
  });

  it('omits avg/max fields entirely when no records have the metric', () => {
    const records: FitRecord[] = [
      { timestamp: t(0), distance: 0 },
      { timestamp: t(1), distance: 5 },
    ];
    const result = computeSessionTotals(records);
    expect(result.avg_heart_rate).toBeUndefined();
    expect(result.max_heart_rate).toBeUndefined();
    expect(result.avg_power).toBeUndefined();
    expect(result.avg_cadence).toBeUndefined();
    expect('avg_power' in result).toBe(false);
  });
});
