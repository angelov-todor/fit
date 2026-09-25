import { describe, it, expect } from 'vitest';
import {
  buildStyle,
  routeGradient,
  AHEAD_COLOR,
  SATELLITE_TILE_SIZE,
  TERRAIN_TILE_SIZE,
  TRAVELED_COLOR,
} from '../utils/flyoverStyle';

describe('buildStyle', () => {
  it('points both sources at MapTiler with the key', () => {
    const style = buildStyle('abc123');
    expect(style.version).toBe(8);
    expect(style.sources.satellite).toEqual({
      type: 'raster',
      url: 'https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=abc123',
      tileSize: SATELLITE_TILE_SIZE,
    });
    expect(style.sources.terrain).toEqual({
      type: 'raster-dem',
      url: 'https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=abc123',
      tileSize: TERRAIN_TILE_SIZE,
    });
    expect(style.layers).toEqual([{ id: 'satellite', type: 'raster', source: 'satellite' }]);
  });

  it('URL-encodes the key', () => {
    expect(JSON.stringify(buildStyle('a b&c=d'))).toContain('key=a%20b%26c%3Dd');
  });
});

describe('routeGradient', () => {
  it('is the traveled colour behind the rider and the ahead colour beyond', () => {
    expect(routeGradient(0.3)).toEqual(['step', ['line-progress'], TRAVELED_COLOR, 0.3, AHEAD_COLOR]);
  });

  it.each([
    [-0.5, 0],
    [1.5, 1],
  ])('clamps %s to %s', (input, want) => {
    expect((routeGradient(input) as unknown[])[3]).toBe(want);
  });
});
