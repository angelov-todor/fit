import { afterEach, describe, it, expect, vi } from 'vitest';
import { mapTilerErrorKind, mapTilerKey } from '../utils/flyoverConfig';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mapTilerKey', () => {
  it('returns the configured key, trimmed', () => {
    vi.stubEnv('VITE_MAPTILER_KEY', '  abc123 \n');
    expect(mapTilerKey()).toBe('abc123');
  });

  it.each(['', '   '])('is undefined for a blank key (%j)', value => {
    vi.stubEnv('VITE_MAPTILER_KEY', value);
    expect(mapTilerKey()).toBeUndefined();
  });
});

describe('mapTilerErrorKind', () => {
  it.each([
    [{ status: 401 }, 'key'],
    [{ status: 403 }, 'key'],
    [{ status: 429 }, 'quota'],
  ] as const)('reads %o as %s', (error, want) => {
    expect(mapTilerErrorKind(error)).toBe(want);
  });

  it.each([{ status: 500 }, new Error('network'), undefined, 'boom'])(
    'has nothing to say about %o, so it gets logged instead',
    error => {
      expect(mapTilerErrorKind(error)).toBeUndefined();
    },
  );
});
