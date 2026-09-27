import type { FitRecord } from '../types/fit';
import { computeHeadings } from './flyoverHeading';
import { haversineMeters, mercatorX, mercatorY, type LngLatPoint } from './geo';

export interface RoutePoint {
  lng: number;
  lat: number;
  /** Cumulative Web-Mercator length: the animation axis, matching MapLibre's line-progress. */
  m: number;
  /** Metres, for display. */
  distance: number;
  /** Unwrapped degrees, from computeHeadings. */
  heading: number;
  /** Recorded altitude, metres. */
  elevation?: number;
  /** Seconds since the first timed point. */
  elapsed?: number;
  heartRate?: number;
  /** Metres per second. */
  speed?: number;
}

/** A point interpolated anywhere along the route; same shape as RoutePoint. */
export type RoutePosition = RoutePoint;

export interface Route {
  /** At least 2, with strictly increasing m. */
  points: RoutePoint[];
  /** Greater than 0. */
  totalM: number;
  /** Metres. */
  totalDistance: number;
  /** Every point has a timestamp. */
  timed: boolean;
}

/** Web Mercator can't represent latitudes beyond this, and MapLibre can't draw them. */
const MAX_MERCATOR_LAT = 85.051129;

const OPTIONAL_FIELDS = ['elevation', 'elapsed', 'heartRate', 'speed'] as const;

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function timeOf(record: FitRecord): number | undefined {
  const t = record.timestamp;
  return t instanceof Date && Number.isFinite(t.getTime()) ? t.getTime() : undefined;
}

/**
 * The record's position, or null when it has none worth flying to. (0, 0) is
 * what devices write before they have a fix; following it would fly the camera
 * across the planet, loading tiles all the way.
 */
function usablePosition(record: FitRecord): LngLatPoint | null {
  const lat = finite(record.position_lat);
  const lng = finite(record.position_long);
  if (lat === undefined || lng === undefined) return null;
  if (Math.abs(lat) > MAX_MERCATOR_LAT || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lng, lat };
}

interface Fix extends LngLatPoint {
  record: FitRecord;
}

/** Usable positions in order, with consecutive identical ones collapsed into the first. */
function fixes(records: FitRecord[]): Fix[] {
  const out: Fix[] = [];
  for (const record of records) {
    const position = usablePosition(record);
    if (!position) continue;
    const previous = out[out.length - 1];
    if (previous && previous.lng === position.lng && previous.lat === position.lat) continue;
    out.push({ ...position, record });
  }
  return out;
}

/** True exactly when buildRoute(records) would return a route. Stops at the second distinct position. */
export function hasFlyoverRoute(records: FitRecord[]): boolean {
  let first: LngLatPoint | null = null;
  for (const record of records) {
    const position = usablePosition(record);
    if (!position) continue;
    if (!first) first = position;
    else if (position.lng !== first.lng || position.lat !== first.lat) return true;
  }
  return false;
}

/** The route to fly along, or null when there are fewer than 2 distinct usable positions. */
export function buildRoute(records: FitRecord[]): Route | null {
  const fx = fixes(records);
  if (fx.length < 2) return null;

  // Never mixed: either every point shows the device's distance, or every
  // point shows geometry, so the readout never jumps between the two.
  const useRecordedDistance = fx.every(f => finite(f.record.distance) !== undefined);
  const firstTime = fx.map(f => timeOf(f.record)).find(t => t !== undefined);
  const headings = computeHeadings(fx);

  const points: RoutePoint[] = [];
  let m = 0;
  let ground = 0;
  fx.forEach((f, i) => {
    if (i > 0) {
      const p = fx[i - 1];
      m += Math.hypot(mercatorX(f.lng) - mercatorX(p.lng), mercatorY(f.lat) - mercatorY(p.lat));
      ground += haversineMeters(p.lat, p.lng, f.lat, f.lng);
    }
    const r = f.record;
    const time = timeOf(r);
    points.push({
      lng: f.lng,
      lat: f.lat,
      m,
      distance: useRecordedDistance ? (finite(r.distance) as number) : ground,
      heading: headings[i],
      elevation: finite(r.enhanced_altitude) ?? finite(r.altitude),
      elapsed: time !== undefined && firstTime !== undefined ? (time - firstTime) / 1000 : undefined,
      heartRate: finite(r.heart_rate),
      speed: finite(r.speed) ?? finite(r.enhanced_speed),
    });
  });

  const last = points[points.length - 1];
  return {
    points,
    totalM: last.m,
    totalDistance: last.distance,
    timed: fx.every(f => timeOf(f.record) !== undefined),
  };
}

/** The position at Mercator length `m` along the route, clamped to [0, totalM]. */
export function positionAtM(route: Route, m: number): RoutePosition {
  const { points } = route;
  const target = Math.min(Math.max(m, 0), route.totalM);

  // Find the bracketing pair: points[lo].m <= target <= points[hi].m.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].m <= target) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const t = b.m === a.m ? 0 : (target - a.m) / (b.m - a.m);
  // t === 1 returns b's value exactly, so the end of the route is the last point, bit for bit.
  const lerp = (x: number, y: number) => (t === 1 ? y : x + (y - x) * t);

  const position: RoutePosition = {
    lng: lerp(a.lng, b.lng),
    lat: lerp(a.lat, b.lat),
    m: target,
    distance: lerp(a.distance, b.distance),
    heading: lerp(a.heading, b.heading),
  };
  for (const key of OPTIONAL_FIELDS) {
    const x = a[key];
    const y = b[key];
    // Known at one end only: keep it, so one dropped sensor reading doesn't blink the readout.
    position[key] = x !== undefined && y !== undefined ? lerp(x, y) : (x ?? y);
  }
  return position;
}

/** The position at `progress` ∈ [0, 1] of the way along the route, clamped. */
export function positionAt(route: Route, progress: number): RoutePosition {
  return positionAtM(route, Math.min(Math.max(progress, 0), 1) * route.totalM);
}
