/**
 * Geometry on a sphere, shared by the GPX parser and the 3D flyover. One
 * sphere throughout, so distances and destinations agree with each other.
 */

export interface LngLatPoint {
  lng: number;
  lat: number;
}

export const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in metres between two positions. */
export function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing, degrees clockwise from north, in [0, 360). */
export function bearingDeg(from: LngLatPoint, to: LngLatPoint): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lng - from.lng);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `meters` along `bearing` from `from`, on the same sphere. */
export function destinationPoint(from: LngLatPoint, bearing: number, meters: number): LngLatPoint {
  const angular = meters / EARTH_RADIUS_M;
  const theta = toRad(bearing);
  const lat1 = toRad(from.lat);
  const lon1 = toRad(from.lng);
  const sinLat2 =
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(theta);
  const lat2 = Math.asin(sinLat2);
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * sinLat2,
    );
  return { lng: ((toDeg(lon2) + 540) % 360) - 180, lat: toDeg(lat2) };
}

/** Spherical Mercator x in [0, 1]. Identical to @maplibre/geojson-vt projectX. */
export function mercatorX(lng: number): number {
  return lng / 360 + 0.5;
}

/** Spherical Mercator y in [0, 1]. Identical to @maplibre/geojson-vt projectY. */
export function mercatorY(lat: number): number {
  const sin = Math.sin(lat * Math.PI / 180);
  const y2 = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
  return y2 < 0 ? 0 : y2 > 1 ? 1 : y2;
}
