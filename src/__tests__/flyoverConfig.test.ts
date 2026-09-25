import { afterEach, describe, it, expect, vi } from 'vitest';
import { mapTilerKey } from '../utils/flyoverConfig';

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
