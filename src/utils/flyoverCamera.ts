import { destinationPoint, haversineMeters, type LngLatPoint } from './geo';
import { positionAt, type Route } from './flyoverRoute';

export interface CameraConfig {
  /** Ground distance behind the rider, metres. */
  behindM: number;
  /** Height above the rider, metres. */
  aboveM: number;
  /** Minimum height above the ground directly beneath the camera, metres. */
  clearanceM: number;
}

export const DEFAULT_CAMERA: CameraConfig = { behindM: 200, aboveM: 100, clearanceM: 30 };

/**
 * The map is created with this maxPitch. DEFAULT_CAMERA gives about 63.4° on flat
 * ground, and the terrain clamp only lowers it. A pose past the limit would be
 * clamped silently by jumpTo, and the rider would slide off-centre.
 */
export const MAX_PITCH = 75;

/** Terrain height in metres, or null when tiles are not loaded yet. */
export type GroundAt = (p: LngLatPoint) => number | null;

export interface CameraPose {
  from: LngLatPoint;
  /** Metres above sea level. */
  fromAltitude: number;
  /** The rider. */
  to: LngLatPoint;
  toAltitude: number;
  /** Degrees in [0, 360): the way the camera faces. */
  heading: number;
}

/**
 * Where the camera goes at `progress`. A function of its arguments alone, so a
 * scrubbed position looks the same whichever way the scrubber arrived.
 */
export function chaseCamera(
  route: Route,
  progress: number,
  groundAt: GroundAt,
  config: CameraConfig = DEFAULT_CAMERA,
): CameraPose {
  const rider = positionAt(route, progress);
  const heading = ((rider.heading % 360) + 360) % 360;
  const to: LngLatPoint = { lng: rider.lng, lat: rider.lat };
  // The marker sits on the terrain; the recorded altitude is often tens of metres off it.
  const toAltitude = groundAt(to) ?? rider.elevation ?? 0;
  const from = destinationPoint(to, heading + 180, config.behindM);
  const fromAltitude = Math.max(
    toAltitude + config.aboveM,
    (groundAt(from) ?? toAltitude) + config.clearanceM,
  );
  return { from, fromAltitude, to, toAltitude, heading };
}

/** Angle of the line of sight from vertical, in degrees. */
export function pitchDeg(pose: CameraPose): number {
  const horizontal = haversineMeters(pose.from.lat, pose.from.lng, pose.to.lat, pose.to.lng);
  return (Math.atan2(horizontal, pose.fromAltitude - pose.toAltitude) * 180) / Math.PI;
}
