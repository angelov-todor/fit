import type { FitRecord } from '../types/fit';
import { buildRoute, type Route } from '../utils/flyoverRoute';
import { destinationPoint, type LngLatPoint } from '../utils/geo';

/** A real place away from the equator, so latitude effects are present. */
export const SOFIA: LngLatPoint = { lng: 23.32, lat: 42.7 };

/** A straight leg: `from`, then a point every `stepM` along `bearing`, for `meters` in total. */
export function straight(from: LngLatPoint, bearing: number, meters: number, stepM = 10): LngLatPoint[] {
  const out: LngLatPoint[] = [];
  const steps = Math.round(meters / stepM);
  for (let k = 0; k <= steps; k++) out.push(k === 0 ? from : destinationPoint(from, bearing, k * stepM));
  return out;
}

/** Joins legs end to end. Each leg after the first starts where the previous one ended; that shared point is kept once. */
export function join(...legs: LngLatPoint[][]): LngLatPoint[] {
  return legs.flatMap((leg, i) => (i === 0 ? leg : leg.slice(1)));
}

/** The last point of a path. */
export function end(points: LngLatPoint[]): LngLatPoint {
  return points[points.length - 1];
}

/** FIT records at the given positions, each optionally extended. */
export function toRecords(
  points: LngLatPoint[],
  extra: (i: number) => Partial<FitRecord> = () => ({}),
): FitRecord[] {
  return points.map((p, i) => ({ position_lat: p.lat, position_long: p.lng, ...extra(i) }));
}

/** Smallest angle between two headings, in degrees [0, 180]. Works on unwrapped values. */
export function angleBetween(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

/** buildRoute, failing the test outright when the records make no route. */
export function routeOf(records: FitRecord[]): Route {
  const route = buildRoute(records);
  if (!route) throw new Error('expected these records to make a route');
  return route;
}
