import { describe, it, expect } from 'vitest';
import { flyoverStats } from '../utils/flyoverStats';
import type { Route, RoutePosition } from '../utils/flyoverRoute';

const route = (over: Partial<Route> = {}): Route => ({
  points: [],
  totalM: 1,
  totalDistance: 42_000,
  timed: true,
  ...over,
});

const at = (over: Partial<RoutePosition> = {}): RoutePosition => ({
  lng: 23.32,
  lat: 42.7,
  m: 0.5,
  distance: 12_346,
  heading: 90,
  ...over,
});

describe('flyoverStats', () => {
  it('shows every reading in the overlay format', () => {
    expect(flyoverStats(at({ elevation: 612.4, speed: 8.25, heartRate: 151.6, elapsed: 3725 }), route())).toEqual([
      { label: 'Distance', value: '12.35 km / 42.00 km' },
      { label: 'Elevation', value: '612 m' },
      { label: 'Speed', value: '29.7 km/h' },
      { label: 'Heart rate', value: '152 bpm' },
      { label: 'Time', value: '1:02:05' },
    ]);
  });

  it('shows whole metres under a kilometre', () => {
    expect(flyoverStats(at({ distance: 850 }), route({ totalDistance: 900 }))[0].value).toBe('850 m / 900 m');
  });

  it('hides readings the file does not have, rather than showing zero', () => {
    expect(flyoverStats(at(), route()).map(s => s.label)).toEqual(['Distance']);
  });

  it('hides the time on an untimed route', () => {
    expect(flyoverStats(at({ elapsed: 60 }), route({ timed: false })).map(s => s.label)).toEqual(['Distance']);
  });
});
