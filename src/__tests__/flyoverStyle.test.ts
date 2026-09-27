import { describe, it, expect } from 'vitest';
import {
  buildStyle,
  routeGradient,
  AHEAD_COLOR,
  GRADIENT_EDGE,
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
    expect(routeGradient(0.3)).toEqual([
      'interpolate', ['linear'], ['line-progress'],
      0.3 - GRADIENT_EDGE, TRAVELED_COLOR,
      0.3, AHEAD_COLOR,
    ]);
  });

  it("is not a 'step', which MapLibre renders into a texture up to the GPU's maximum width, rebuilt per tile every frame", () => {
    // An interpolate gets a fixed 256 px ramp per tile instead (draw_line updateGradientTexture).
    expect((routeGradient(0.3) as unknown[])[0]).toBe('interpolate');
  });

  it('keeps the colour change within centimetres of the rider', () => {
    // 1e-6 of a 122 km ride is 12 cm.
    expect(GRADIENT_EDGE).toBeLessThanOrEqual(1e-6);
  });

  it.each([
    [-0.5, 0],
    [1.5, 1],
  ])('clamps %s to %s', (input, want) => {
    expect((routeGradient(input) as unknown[])[5]).toBe(want);
  });
});

describe('tile sizes', () => {
  // Measured against the live service on 2026-09-27: satellite-v2 serves 512 px
  // JPEGs and terrain-rgb-v2 512 px WebPs. Declaring 256 would make MapLibre
  // fetch a zoom level deeper, about 4x the tile requests against the quota.
  it('match the 512 px tiles MapTiler serves', () => {
    expect(SATELLITE_TILE_SIZE).toBe(512);
    expect(TERRAIN_TILE_SIZE).toBe(512);
  });
});
