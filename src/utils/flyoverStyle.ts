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

/**
 * The finest satellite zoom requested. MapTiler serves up to 22, but at chase-camera
 * distance anything past 17 is detail nobody can see: measured over the same
 * 2.4 km with a cold cache, uncapped cost 111 tiles per km (mostly z18-19), a cap
 * of 17 cost 36, and the frames looked the same. Beyond it MapLibre overzooms z17
 * tiles. 16 would halve requests again, at the cost of a softer foreground.
 */
export const SATELLITE_MAX_ZOOM = 17;

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
        maxzoom: SATELLITE_MAX_ZOOM,
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

/** Width of the colour change, as a fraction of the route: 12 cm on a 122 km ride. */
export const GRADIENT_EDGE = 1e-6;

/**
 * The route's colour along its length: traveled up to the rider, ahead after.
 * line-progress is a fraction of the line's Web-Mercator length, the same axis
 * as the flyover's progress, so the change of colour sits under the rider.
 *
 * A steep 'interpolate' rather than a 'step'. MapLibre renders a step into a
 * colour ramp as wide as the whole line needs, up to the GPU's maximum texture
 * width, and this changes every frame, so that ramp would be rebuilt and
 * re-uploaded for every tile 60 times a second. Any other expression gets a
 * fixed 256 px ramp per tile, which still places the edge to within a metre or so.
 */
export function routeGradient(progress: number): ExpressionSpecification {
  const p = Math.min(Math.max(progress, 0), 1);
  return ['interpolate', ['linear'], ['line-progress'], p - GRADIENT_EDGE, TRAVELED_COLOR, p, AHEAD_COLOR];
}
