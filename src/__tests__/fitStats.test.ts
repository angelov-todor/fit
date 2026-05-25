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

describe('computeSessionTotals — altitude and elevation', () => {
  it('reports avg/max/min altitude using enhanced_altitude when present', () => {
    const records: FitRecord[] = [
      { timestamp: t(0), distance: 0,  enhanced_altitude: 100, altitude: 50 },
      { timestamp: t(1), distance: 5,  enhanced_altitude: 110, altitude: 50 },
      { timestamp: t(2), distance: 10, enhanced_altitude: 120, altitude: 50 },
    ];
    const result = computeSessionTotals(records);
    expect(result.avg_altitude).toBe(110);
    expect(result.max_altitude).toBe(120);
    expect(result.min_altitude).toBe(100);
  });

  it('falls back to altitude when enhanced_altitude is missing', () => {
    const records: FitRecord[] = [
      { timestamp: t(0), distance: 0,  altitude: 100 },
      { timestamp: t(1), distance: 5,  altitude: 200 },
    ];
    const result = computeSessionTotals(records);
    expect(result.max_altitude).toBe(200);
  });

  it('reports zero ascent and descent for constant altitude', () => {
    const records: FitRecord[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: t(i), distance: i, enhanced_altitude: 100,
    }));
    const result = computeSessionTotals(records);
    expect(result.total_ascent).toBe(0);
    expect(result.total_descent).toBe(0);
  });

  it('sums positive deltas for a monotonic climb (after smoothing)', () => {
    // 10 samples rising by 1 m each step → ~8 m after 3-point smoothing
    const records: FitRecord[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: t(i), distance: i, enhanced_altitude: 100 + i,
    }));
    const result = computeSessionTotals(records);
    expect(result.total_ascent).toBeCloseTo(8, 0);
    expect(result.total_descent).toBe(0);
  });

  it('sums descent on a monotonic descent', () => {
    const records: FitRecord[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: t(i), distance: i, enhanced_altitude: 100 - i,
    }));
    const result = computeSessionTotals(records);
    expect(result.total_ascent).toBe(0);
    expect(result.total_descent).toBeCloseTo(8, 0);
  });

  it('smooths out single-sample noise', () => {
    // Mostly flat with a single noisy spike — smoothing should suppress it
    const alts = [100, 100, 100, 105, 100, 100, 100]; // 1 spike of +5
    const records: FitRecord[] = alts.map((a, i) => ({
      timestamp: t(i), distance: i, enhanced_altitude: a,
    }));
    const result = computeSessionTotals(records);
    // Without smoothing this would record ~5m of ascent. With a 3-point
    // moving average, the spike contributes well under 5m.
    expect(result.total_ascent ?? 0).toBeLessThan(5);
  });
});
