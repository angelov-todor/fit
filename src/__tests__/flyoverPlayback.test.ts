import { describe, it, expect } from 'vitest';
import { advance, playFrom, BASE_DURATION_MS, MAX_FRAME_MS } from '../utils/flyoverPlayback';

/** Advances through one second of 60 fps frames. */
function oneSecond(speed: number, from = 0): number {
  let p = from;
  for (let i = 0; i < 60; i++) p = advance(p, 1000 / 60, speed);
  return p;
}

describe('advance', () => {
  it('covers the route in 60 s at 1×', () => {
    expect(oneSecond(1)).toBeCloseTo(1 / 60, 9);
  });

  it('doubles at 2×', () => {
    expect(oneSecond(2)).toBeCloseTo(2 / 60, 9);
  });

  it('stops at the end', () => {
    expect(oneSecond(4, 0.999)).toBe(1);
  });

  it('treats a long pause (a background tab) as a single capped frame', () => {
    expect(advance(0, 5000, 1)).toBeCloseTo(MAX_FRAME_MS / BASE_DURATION_MS, 12);
  });

  it('never runs backwards on a negative frame time', () => {
    expect(advance(0.5, -40, 1)).toBe(0.5);
  });
});

describe('playFrom', () => {
  it('restarts a finished run from the top', () => {
    expect(playFrom(1)).toBe(0);
  });

  it.each([0, 0.25, 0.999])('resumes from %s', p => {
    expect(playFrom(p)).toBe(p);
  });
});
