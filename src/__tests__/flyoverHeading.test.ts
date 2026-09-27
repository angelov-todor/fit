import { describe, it, expect } from 'vitest';
import { computeHeadings } from '../utils/flyoverHeading';
import { destinationPoint } from '../utils/geo';
import { SOFIA, angleBetween, end, join, straight } from './flyoverFixtures';

/** Largest change between consecutive headings. Unwrapped, so a wrap bug shows up as ~360. */
function maxStep(headings: number[]): number {
  let worst = 0;
  for (let i = 1; i < headings.length; i++) {
    worst = Math.max(worst, Math.abs(headings[i] - headings[i - 1]));
  }
  return worst;
}

describe('computeHeadings', () => {
  it('reads due east along a straight eastbound road', () => {
    const headings = computeHeadings(straight(SOFIA, 90, 2000));
    for (const h of headings) expect(angleBetween(h, 90)).toBeLessThan(0.5);
  });

  it('turns smoothly through a 90° left turn', () => {
    const east = straight(SOFIA, 90, 1000);
    const headings = computeHeadings(join(east, straight(end(east), 0, 1000)));
    expect(angleBetween(headings[0], 90)).toBeLessThan(0.5);
    expect(angleBetween(headings[headings.length - 1], 0)).toBeLessThan(0.5);
    // Never swings back. The tolerance is for the east leg itself: a great circle
    // that sets off due east curves south, so its bearing creeps up by about
    // 0.0001° per 10 m. That is geometry, not a reversal.
    for (let i = 1; i < headings.length; i++) {
      expect(headings[i]).toBeLessThanOrEqual(headings[i - 1] + 0.01);
    }
    expect(maxStep(headings)).toBeLessThanOrEqual(7.5);
  });

  it('rotates through a turnaround instead of snapping', () => {
    // Out and back on the very same road, 10 m between points.
    const out = straight(SOFIA, 90, 2000);
    const headings = computeHeadings(join(out, [...out].reverse()));
    const apex = out.length - 1;
    expect(headings.every(Number.isFinite)).toBe(true);
    expect(angleBetween(headings[apex - 40], 90)).toBeLessThan(0.5); // 400 m before
    expect(angleBetween(headings[apex + 40], 270)).toBeLessThan(0.5); // 400 m after
    expect(maxStep(headings)).toBeLessThanOrEqual(7.5);
  });

  it('holds the road heading through GPS drift at a stop', () => {
    const before = straight(SOFIA, 90, 500);
    const stop = end(before);
    // Sixty fixes hopping 3 m either side of the road while stationary.
    const drift = Array.from({ length: 60 }, (_, k) => destinationPoint(stop, k % 2 === 0 ? 0 : 180, 3));
    const after = straight(stop, 90, 500);
    const headings = computeHeadings([...before, ...drift, ...after.slice(1)]);
    for (const h of headings) expect(angleBetween(h, 90)).toBeLessThan(10);
  });

  it('barely moves for a single sideways jitter point', () => {
    const road = straight(SOFIA, 90, 2000);
    const jittered = road.map((p, i) => (i === 100 ? destinationPoint(p, 0, 30) : p));
    expect(angleBetween(computeHeadings(jittered)[100], 90)).toBeLessThan(1);
  });

  it('gives a two-point route its segment bearing', () => {
    const headings = computeHeadings(straight(SOFIA, 90, 50, 50));
    expect(headings).toHaveLength(2);
    for (const h of headings) expect(angleBetween(h, 90)).toBeLessThan(0.5);
  });

  it('stays finite when every chord is crooked', () => {
    const b = destinationPoint(SOFIA, 90, 5);
    const zigzag = Array.from({ length: 40 }, (_, k) => (k % 2 === 0 ? SOFIA : b));
    expect(computeHeadings(zigzag).every(Number.isFinite)).toBe(true);
  });
});
