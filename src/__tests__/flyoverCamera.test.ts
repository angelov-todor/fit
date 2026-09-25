import { describe, it, expect } from 'vitest';
import { chaseCamera, groundFromTerrain, pitchDeg, DEFAULT_CAMERA, MAX_PITCH } from '../utils/flyoverCamera';
import { bearingDeg, haversineMeters } from '../utils/geo';
import { SOFIA, angleBetween, end, join, routeOf, straight, toRecords } from './flyoverFixtures';

const flat = () => 0;
const northbound = () => routeOf(toRecords(straight(SOFIA, 0, 2000)));

describe('chaseCamera', () => {
  it('sits 200 m behind the rider, facing along the route', () => {
    const pose = chaseCamera(northbound(), 0.5, flat);
    expect(angleBetween(pose.heading, 0)).toBeLessThan(0.5);
    expect(angleBetween(bearingDeg(pose.to, pose.from), 180)).toBeLessThan(0.5);
    expect(haversineMeters(pose.from.lat, pose.from.lng, pose.to.lat, pose.to.lng)).toBeCloseTo(
      DEFAULT_CAMERA.behindM,
      3,
    );
  });

  it('swings behind the new direction after a turn', () => {
    const east = straight(SOFIA, 90, 1000);
    const r = routeOf(toRecords(join(east, straight(end(east), 0, 1000))));
    // 0.9 of the way is ~800 m up the northbound leg, well clear of the corner.
    const pose = chaseCamera(r, 0.9, flat);
    expect(angleBetween(pose.heading, 0)).toBeLessThan(1);
    expect(angleBetween(bearingDeg(pose.to, pose.from), 180)).toBeLessThan(1);
  });

  it('gives the same pose however the scrubber got there', () => {
    // Pins "no hidden state": a smoother with memory would fail this.
    const r = northbound();
    chaseCamera(r, 0.9, flat);
    const afterForward = chaseCamera(r, 0.4, flat);
    chaseCamera(r, 0.1, flat);
    expect(chaseCamera(r, 0.4, flat)).toEqual(afterForward);
  });

  it('climbs over a ridge behind the rider', () => {
    const r = northbound();
    const rider = chaseCamera(r, 0.5, flat).to;
    // Northbound, so everything behind the rider is south: make that a ridge.
    const ridge = (p: { lat: number }) => (p.lat < rider.lat - 1e-4 ? 800 : 100);
    const pose = chaseCamera(r, 0.5, ridge);
    expect(pose.toAltitude).toBe(100);
    expect(pose.fromAltitude).toBeGreaterThanOrEqual(800 + DEFAULT_CAMERA.clearanceM);
    expect(pitchDeg(pose)).toBeLessThan(pitchDeg(chaseCamera(r, 0.5, flat)));
  });

  it('uses recorded elevation until terrain loads, and sea level when there is none', () => {
    const withAltitude = routeOf(toRecords(straight(SOFIA, 0, 2000), () => ({ altitude: 250 })));
    const pose = chaseCamera(withAltitude, 0.5, () => null);
    expect(pose.toAltitude).toBe(250);
    expect(pose.fromAltitude).toBe(250 + DEFAULT_CAMERA.aboveM);
    expect(chaseCamera(northbound(), 0.5, () => null).toAltitude).toBe(0);
  });

  it("keeps the default geometry inside the map's pitch limit", () => {
    const pitch = pitchDeg(chaseCamera(northbound(), 0.5, flat));
    expect(pitch).toBeLessThanOrEqual(MAX_PITCH);
    expect(pitch).toBeCloseTo(63.4, 1);
  });
});

describe('groundFromTerrain', () => {
  // MapLibre's queryTerrainElevation answers 0, not null, wherever its DEM tiles
  // haven't loaded yet. Taken at face value, that puts the camera at sea level.
  it('starts a mountain ride above the mountain while terrain is still loading', () => {
    const alpine = routeOf(toRecords(straight(SOFIA, 0, 2000), () => ({ altitude: 1800 })));
    const pose = chaseCamera(alpine, 0.5, groundFromTerrain(() => 0));
    expect(pose.toAltitude).toBe(1800);
    expect(pose.fromAltitude).toBe(1800 + DEFAULT_CAMERA.aboveM);
  });

  it.each([
    [612, 612],
    [-430, -430], // the Dead Sea road: below sea level is real ground
    [null, null],
  ])('passes a terrain reading of %s through as %s', (reading, want) => {
    expect(groundFromTerrain(() => reading)(SOFIA)).toBe(want);
  });
});
