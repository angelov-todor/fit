import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';

const TILES = 'https://api.maptiler.com/tiles';

/**
 * Pixel size of the tiles each source serves. MapTiler offers 256 px and 512 px
 * variants, and a mismatch renders them blurry or too small. Confirmed against
 * a real key in Task 11 of the implementation plan.
 */
export const SATELLITE_TILE_SIZE = 256;
export const TERRAIN_TILE_SIZE = 256;

/** Matches the Leaflet route in MapView. */
export const TRAVELED_COLOR = '#3b82f6';
export const AHEAD_COLOR = 'rgba(255, 255, 255, 0.45)';

export function buildStyle(key: string): StyleSpecification {
  const k = encodeURIComponent(key);
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        url: `${TILES}/satellite-v2/tiles.json?key=${k}`,
        tileSize: SATELLITE_TILE_SIZE,
      },
      terrain: {
        type: 'raster-dem',
        url: `${TILES}/terrain-rgb-v2/tiles.json?key=${k}`,
        tileSize: TERRAIN_TILE_SIZE,
      },
    },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
  };
}

/**
 * The route's colour along its length: traveled up to the rider, ahead after.
 * line-progress is a fraction of the line's Web-Mercator length, the same axis
 * as the flyover's progress, so the change of colour sits under the rider.
 */
export function routeGradient(progress: number): ExpressionSpecification {
  const p = Math.min(Math.max(progress, 0), 1);
  return ['step', ['line-progress'], TRAVELED_COLOR, p, AHEAD_COLOR];
}
