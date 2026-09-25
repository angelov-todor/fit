/** The whole route, start to finish, at 1×. */
export const BASE_DURATION_MS = 60_000;

export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * The longest frame advance counts. Browsers stop animation frames in
 * background tabs, and without the cap the first frame back would leap along
 * the route.
 */
export const MAX_FRAME_MS = 100;

/** Progress after a frame of `dtMs` at `speed`, clamped to [0, 1]. */
export function advance(progress: number, dtMs: number, speed: number, durationMs = BASE_DURATION_MS): number {
  const dt = Math.min(Math.max(dtMs, 0), MAX_FRAME_MS);
  return Math.min(1, Math.max(0, progress + (dt * speed) / durationMs));
}

/** Where pressing play starts: from the top when the previous run finished. */
export function playFrom(progress: number): number {
  return progress >= 1 ? 0 : progress;
}
