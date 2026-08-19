import { describe, it, expect } from 'vitest';
import { buildChartPoints, availableXAxisModes, defaultXAxisMode } from '../utils/chartData';
import type { FitRecord } from '../types/fit';

const t = (s: number) => new Date(Date.UTC(2026, 3, 11, 7, 0, s));

const timed: FitRecord[] = [
  { timestamp: t(0), distance: 0, altitude: 300, heart_rate: 120, speed: 5 },
  { timestamp: t(30), distance: 150, altitude: 310, heart_rate: 130, speed: 6 },
];

// A planned route: elevation on every point, but no clock at all.
const untimed: FitRecord[] = [
  { distance: 0, altitude: 300 },
  { distance: 120, altitude: 306 },
  { distance: 245, altitude: 313 },
];

describe('buildChartPoints', () => {
  it('keeps records that have no timestamp', () => {
    expect(buildChartPoints(untimed)).toHaveLength(3);
  });

  it('carries the metric values of untimed records', () => {
    const points = buildChartPoints(untimed);
    expect(points.map(p => p.altitude)).toEqual([300, 306, 313]);
    expect(points.map(p => p.distance)).toEqual([0, 120, 245]);
  });

  it('builds a point per timestamped record', () => {
    const points = buildChartPoints(timed);
    expect(points).toHaveLength(2);
    expect(points[0].heart_rate).toBe(120);
    expect(points[1].elapsed).toBe(30);
  });

  it('converts speed to km/h', () => {
    expect(buildChartPoints(timed)[0].speed).toBeCloseTo(18, 2);
  });

  it('leaves the time label empty for untimed records', () => {
    expect(buildChartPoints(untimed).every(p => p.time === '')).toBe(true);
  });

  it('gives untimed records zero elapsed time', () => {
    expect(buildChartPoints(untimed).map(p => p.elapsed)).toEqual([0, 0, 0]);
  });

  it('prefers enhanced_altitude over altitude', () => {
    const points = buildChartPoints([{ altitude: 300, enhanced_altitude: 305 }]);
    expect(points[0].altitude).toBe(305);
  });

  it('omits metrics the record does not carry', () => {
    expect(buildChartPoints(untimed)[0].heart_rate).toBeUndefined();
  });
});

describe('availableXAxisModes', () => {
  it('offers time, elapsed and distance when records are timestamped', () => {
    expect(availableXAxisModes(timed)).toEqual(['time', 'elapsed', 'distance']);
  });

  it('offers only distance when no record has a timestamp', () => {
    expect(availableXAxisModes(untimed)).toEqual(['distance']);
  });

  it('offers the time modes when only some records are timestamped', () => {
    expect(availableXAxisModes([...untimed, ...timed])).toContain('time');
  });
});

describe('defaultXAxisMode', () => {
  it('defaults to time for a timestamped activity', () => {
    expect(defaultXAxisMode(timed)).toBe('time');
  });

  it('defaults to distance for an untimed route', () => {
    expect(defaultXAxisMode(untimed)).toBe('distance');
  });
});
