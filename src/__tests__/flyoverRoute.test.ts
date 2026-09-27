import { describe, it, expect } from 'vitest';
import { buildRoute, hasFlyoverRoute, positionAt } from '../utils/flyoverRoute';
import { destinationPoint, haversineMeters, type LngLatPoint } from '../utils/geo';
import type { FitRecord } from '../types/fit';
import { SOFIA, angleBetween, end, routeOf, straight, toRecords } from './flyoverFixtures';

const A = SOFIA;
const B = destinationPoint(SOFIA, 90, 100);
const C = destinationPoint(SOFIA, 90, 200);

const at = (p: LngLatPoint, extra: Partial<FitRecord> = {}): FitRecord => ({
  position_lat: p.lat,
  position_long: p.lng,
  ...extra,
});

describe('buildRoute — what counts as a route', () => {
  it.each<[string, FitRecord[]]>([
    ['no records', []],
    ['no GPS', [{ heart_rate: 140 }]],
    ['a single point', [at(A)]],
    ['one position repeated', [at(A), at(A), at(A)]],
  ])('is null for %s', (_label, records) => {
    expect(buildRoute(records)).toBeNull();
  });

  it('skips (0, 0), non-finite and out-of-range positions', () => {
    const r = routeOf([
      at({ lng: 0, lat: 0 }),
      at(A),
      { position_lat: Number.NaN, position_long: 23.3 },
      { position_lat: 89, position_long: 23.3 },
      { position_lat: 42.7, position_long: 181 },
      at(B),
    ]);
    expect(r.points.map(p => [p.lng, p.lat])).toEqual([
      [A.lng, A.lat],
      [B.lng, B.lat],
    ]);
  });

  it('collapses consecutive duplicates into a strictly increasing axis', () => {
    const r = routeOf([at(A), at(A), at(B), at(B), at(C)]);
    expect(r.points).toHaveLength(3);
    expect(r.points[1].m).toBeGreaterThan(r.points[0].m);
    expect(r.points[2].m).toBeGreaterThan(r.points[1].m);
    expect(r.totalM).toBe(r.points[2].m);
  });

  it('agrees with hasFlyoverRoute on every fixture', () => {
    const fixtures: FitRecord[][] = [
      [],
      [{ heart_rate: 140 }],
      [at(A)],
      [at(A), at(A)],
      [at({ lng: 0, lat: 0 }), at(A)],
      [at(A), at(B)],
      [at(A), at(A), at(B)],
      [at(A), at(B), at(A)],
    ];
    for (const records of fixtures) {
      expect(hasFlyoverRoute(records)).toBe(buildRoute(records) !== null);
    }
  });
});

describe('buildRoute — the animation axis', () => {
  it('measures progress in Web-Mercator length, as MapLibre line-progress does', () => {
    // 1 km east at the equator, a long jump north, then 1 km east at 60°N.
    const equatorLeg = straight({ lng: 10, lat: 0 }, 90, 1000, 1000);
    const highLeg = straight({ lng: end(equatorLeg).lng, lat: 60 }, 90, 1000, 1000);
    const [p0, p1, p2, p3] = routeOf(toRecords([...equatorLeg, ...highLeg])).points;
    // Equal ground length, but Mercator stretches by 1 / cos(lat): twice as long at 60°.
    expect((p3.m - p2.m) / (p1.m - p0.m)).toBeCloseTo(2, 2);
  });
});

describe('buildRoute — displayed values', () => {
  it('uses recorded distance when every point has one', () => {
    const r = routeOf(toRecords([A, B, C], i => ({ distance: i * 40 })));
    expect(r.points.map(p => p.distance)).toEqual([0, 40, 80]);
    expect(r.totalDistance).toBe(80);
  });

  it('falls back to geometry for every point when any point lacks a distance', () => {
    const r = routeOf(toRecords([A, B, C], i => (i === 1 ? {} : { distance: i * 40 })));
    expect(r.points[0].distance).toBe(0);
    expect(r.points[1].distance).toBeCloseTo(haversineMeters(A.lat, A.lng, B.lat, B.lng), 6);
    expect(r.totalDistance).toBeCloseTo(200, 0);
  });

  it('prefers enhanced altitude and falls back to enhanced speed', () => {
    const r = routeOf([
      at(A, { altitude: 100, enhanced_altitude: 101, enhanced_speed: 6 }),
      at(B, { altitude: 200, speed: 5, enhanced_speed: 7 }),
    ]);
    expect(r.points[0]).toMatchObject({ elevation: 101, speed: 6 });
    expect(r.points[1]).toMatchObject({ elevation: 200, speed: 5 });
  });

  it('is timed only when every point has a timestamp, counting from the first', () => {
    const t0 = new Date('2026-08-15T07:00:00Z').getTime();
    const timed = routeOf(toRecords([A, B, C], i => ({ timestamp: new Date(t0 + i * 30_000) })));
    expect(timed.timed).toBe(true);
    expect(timed.points.map(p => p.elapsed)).toEqual([0, 30, 60]);

    const partly = routeOf(toRecords([A, B, C], i => (i === 2 ? {} : { timestamp: new Date(t0 + i * 30_000) })));
    expect(partly.timed).toBe(false);
  });

  it('carries a heading at every point', () => {
    const r = routeOf(toRecords(straight(SOFIA, 90, 1000)));
    for (const p of r.points) expect(angleBetween(p.heading, 90)).toBeLessThan(0.5);
  });
});

describe('positionAt', () => {
  const twoPoints = () =>
    routeOf([
      at(A, { distance: 0, altitude: 100, heart_rate: 140 }),
      at(B, { distance: 100, altitude: 200, heart_rate: 160 }),
    ]);

  it('is the start at 0, the end at 1 and interpolated between', () => {
    const r = twoPoints();
    expect(positionAt(r, 0)).toMatchObject({ lng: A.lng, lat: A.lat, distance: 0 });
    expect(positionAt(r, 1)).toMatchObject({ lng: B.lng, lat: B.lat, distance: 100 });
    const mid = positionAt(r, 0.5);
    expect(mid.distance).toBeCloseTo(50, 9);
    expect(mid.elevation).toBeCloseTo(150, 9);
    expect(mid.heartRate).toBeCloseTo(150, 9);
    expect(mid.lng).toBeCloseTo((A.lng + B.lng) / 2, 12);
  });

  it('clamps progress outside [0, 1]', () => {
    const r = twoPoints();
    expect(positionAt(r, -1)).toEqual(positionAt(r, 0));
    expect(positionAt(r, 2)).toEqual(positionAt(r, 1));
  });

  it('keeps a reading known at only one end, and leaves out one known at neither', () => {
    const r = routeOf([at(A, { heart_rate: 140 }), at(B)]);
    expect(positionAt(r, 0.9).heartRate).toBe(140);
    expect(positionAt(r, 0.5).speed).toBeUndefined();
  });
});
