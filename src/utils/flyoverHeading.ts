import { bearingDeg, haversineMeters, type LngLatPoint } from './geo';

/** Half-width of the heading window, in ground metres. */
export const HEADING_WINDOW_M = 150;

/**
 * A chord shorter than this fraction of the path between its ends means the
 * route folds back inside the window (a U-turn, or GPS drift at a stop), and
 * the chord's bearing means nothing.
 */
export const MIN_STRAIGHTNESS = 0.25;

/** The signed turn from `from` to `to`, in [-180, 180). An exact reversal is -180. */
function shortestTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** The segment containing ground distance `s`: ground[lo] <= s <= ground[hi]. */
function bracket(ground: number[], s: number): [number, number] {
  let lo = 0;
  let hi = ground.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ground[mid] <= s) lo = mid;
    else hi = mid;
  }
  return [lo, hi];
}

/** Position `s` ground metres along the path, clamped to its ends. */
function pointAt(points: LngLatPoint[], ground: number[], s: number): LngLatPoint {
  const last = points.length - 1;
  if (s <= 0) return points[0];
  if (s >= ground[last]) return points[last];
  const [lo, hi] = bracket(ground, s);
  const span = ground[hi] - ground[lo];
  const t = span === 0 ? 0 : (s - ground[lo]) / span;
  return {
    lng: points[lo].lng + (points[hi].lng - points[lo].lng) * t,
    lat: points[lo].lat + (points[hi].lat - points[lo].lat) * t,
  };
}

/**
 * The camera heading at every point, in *unwrapped* degrees. Consecutive values
 * never differ by 180 or more, so a U-turn is a continuous rotation rather than
 * a jump from 90 to 270, and interpolating between two points never swings the
 * long way round. Take `% 360` only at the point of use.
 *
 * There are three passes, each fixing a failure of the one before:
 *
 * 1. The chord bearing from `windowM` behind to `windowM` ahead along the
 *    route. Jitter near the point barely moves it, but it degenerates where the
 *    route folds back.
 * 2. Chords too crooked to mean anything are discarded, and the gaps are filled
 *    from their valid neighbours in unwrapped space.
 * 3. The distance-weighted mean over ±windowM turns the remaining flip at a
 *    turnaround into a gradual rotation.
 */
export function computeHeadings(points: LngLatPoint[], windowM = HEADING_WINDOW_M): number[] {
  const n = points.length;
  if (n === 0) return [];

  const ground = [0];
  for (let i = 1; i < n; i++) {
    const a = points[i - 1];
    const b = points[i];
    ground.push(ground[i - 1] + haversineMeters(a.lat, a.lng, b.lat, b.lng));
  }
  const total = ground[n - 1];

  // Pass 1: chord bearings, with crooked chords discarded as null.
  const chord: (number | null)[] = ground.map(s => {
    const from = Math.max(0, s - windowM);
    const to = Math.min(total, s + windowM);
    const path = to - from;
    if (path <= 0) return null;
    const p = pointAt(points, ground, from);
    const q = pointAt(points, ground, to);
    if (haversineMeters(p.lat, p.lng, q.lat, q.lng) < MIN_STRAIGHTNESS * path) return null;
    return bearingDeg(p, q);
  });

  // Pass 2a: unwrap the valid bearings in sequence.
  const unwrapped: (number | null)[] = [];
  let previous: number | null = null;
  for (const c of chord) {
    if (c === null) {
      unwrapped.push(null);
      continue;
    }
    const u: number = previous === null ? c : previous + shortestTurn(previous, c);
    unwrapped.push(u);
    previous = u;
  }
  if (previous === null) {
    // Nothing valid anywhere: the whole route is one tangle.
    const overall = bearingDeg(points[0], points[n - 1]);
    return points.map(() => overall);
  }

  // Pass 2b: fill the discarded points from their valid neighbours, by ground distance.
  const nextValid = new Array<number>(n);
  let upcoming = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (unwrapped[i] !== null) upcoming = i;
    nextValid[i] = upcoming;
  }
  const filled: number[] = [];
  let lastValid = -1;
  for (let i = 0; i < n; i++) {
    const u = unwrapped[i];
    if (u !== null) {
      filled.push(u);
      lastValid = i;
      continue;
    }
    const next = nextValid[i];
    if (lastValid === -1) {
      filled.push(unwrapped[next] as number);
    } else if (next === -1) {
      filled.push(unwrapped[lastValid] as number);
    } else {
      const a = unwrapped[lastValid] as number;
      const b = unwrapped[next] as number;
      const span = ground[next] - ground[lastValid];
      filled.push(span === 0 ? a : a + (b - a) * ((ground[i] - ground[lastValid]) / span));
    }
  }

  // Pass 3: the mean of the filled heading over ±windowM of ground distance,
  // treating it as piecewise linear. Weighted by distance, not by sample, so a
  // stop's many fixes don't outvote the road, and a sample entering or leaving
  // the window can't make a step: the result is continuous along the route.
  const integral = [0];
  for (let i = 1; i < n; i++) {
    integral.push(integral[i - 1] + ((filled[i - 1] + filled[i]) / 2) * (ground[i] - ground[i - 1]));
  }
  const integralTo = (s: number): number => {
    if (s <= 0) return 0;
    if (s >= total) return integral[n - 1];
    const [lo, hi] = bracket(ground, s);
    const span = ground[hi] - ground[lo];
    const t = s - ground[lo];
    const here = span === 0 ? filled[lo] : filled[lo] + ((filled[hi] - filled[lo]) * t) / span;
    return integral[lo] + ((filled[lo] + here) / 2) * t;
  };
  return ground.map((s, i) => {
    const from = Math.max(0, s - windowM);
    const to = Math.min(total, s + windowM);
    return to > from ? (integralTo(to) - integralTo(from)) / (to - from) : filled[i];
  });
}
