import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';

const TILES = 'https://api.maptiler.com/tiles';

/**
 * Pixel size of the tiles each source serves, measured against the live service
 * (satellite-v2: 512 px JPEG, terrain-rgb-v2: 512 px WebP). A mismatch renders
 * tiles blurry or too small, and declaring 256 for these would make MapLibre
 * fetch a zoom level deeper, about 4x the tile requests.
 */
export const SATELLITE_TILE_SIZE = 512;
export const TERRAIN_TILE_SIZE = 512;

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
