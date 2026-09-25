import { describe, it, expect } from 'vitest';
import {
  bearingDeg,
  destinationPoint,
  haversineMeters,
  mercatorX,
  mercatorY,
} from '../utils/geo';

const sofia = { lng: 23.32, lat: 42.7 };

/** Smallest angle between two bearings, in degrees. */
const angleGap = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

describe('bearingDeg', () => {
  it.each([
    ['north', { lng: 23.32, lat: 42.71 }, 0],
    ['east', { lng: 23.33, lat: 42.7 }, 90],
    ['south', { lng: 23.32, lat: 42.69 }, 180],
    ['west', { lng: 23.31, lat: 42.7 }, 270],
  ])('is the compass bearing due %s', (_label, to, want) => {
    expect(angleGap(bearingDeg(sofia, to), want)).toBeLessThan(0.5);
  });

  it('stays in [0, 360)', () => {
    const b = bearingDeg(sofia, { lng: 23.3199999, lat: 42.71 });
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('destinationPoint', () => {
  it.each([0, 45, 137, 270])('lands 250 m away on bearing %s°', bearing => {
    const to = destinationPoint(sofia, bearing, 250);
    const d = haversineMeters(sofia.lat, sofia.lng, to.lat, to.lng);
    expect(Math.abs(d - 250) / 250).toBeLessThan(0.001);
    expect(angleGap(bearingDeg(sofia, to), bearing)).toBeLessThan(0.05);
  });

  it('returns the start for zero distance', () => {
    const to = destinationPoint(sofia, 90, 0);
    expect(to.lat).toBeCloseTo(sofia.lat, 10);
    expect(to.lng).toBeCloseTo(sofia.lng, 10);
  });
});

describe('mercatorX / mercatorY', () => {
  // Copied verbatim from @maplibre/geojson-vt src/convert.ts. MapLibre measures
  // line-progress with these, so ours must agree to the last bit.
  const projectX = (x: number) => x / 360 + 0.5;
  const projectY = (y: number) => {
    const sin = Math.sin(y * Math.PI / 180);
    const y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
    return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
  };

  it.each([
    [0, 0],
    [23.32, 42.7],
    [-122.4, 37.8],
    [151.2, -33.9],
    [179.9, 85],
  ])('matches geojson-vt at (%s, %s)', (lng, lat) => {
    expect(mercatorX(lng)).toBe(projectX(lng));
    expect(mercatorY(lat)).toBe(projectY(lat));
  });

  it('clamps at the poles', () => {
    expect(mercatorY(90)).toBe(0);
    expect(mercatorY(-90)).toBe(1);
  });
});
