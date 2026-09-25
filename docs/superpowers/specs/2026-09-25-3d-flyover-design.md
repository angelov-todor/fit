# 3D Flyover

## Context

The viewer shows a route on a flat Leaflet map. This adds a **3D flyover**: a
camera that chases the rider along the route over satellite imagery draped on
real terrain, similar in spirit to Strava's flyover.

Scope, as settled in brainstorming:

- **Played in the app.** No video export.
- **Satellite on 3D terrain**, from MapTiler's free tier, with the key restricted
  to this site's origins.
- A new **3D** tab, enabled whenever the file has a usable GPS track. Works for
  FIT, timed GPX and untimed GPX.

Success means a typical 1–3 h ride plays smoothly, the camera never ends up
inside a hillside, and `npm test` and `npm run build` both pass.

## Files

### New

| File | Purpose |
|---|---|
| `src/utils/geo.ts` | Pure geometry: `haversineMeters` and `EARTH_RADIUS_M` (moved from `gpxParser.ts`), bearing, destination point, Web-Mercator projection. |
| `src/utils/flyoverHeading.ts` | Pure: camera heading at every route point, robust to U-turns and GPS drift at stops. |
| `src/utils/flyoverRoute.ts` | Pure: `FitRecord[] → Route`, plus `positionAt` / `positionAtM` interpolation along it. |
| `src/utils/flyoverCamera.ts` | Pure: `(Route, progress, groundAt) → CameraPose`. Chase-cam placement and terrain clamp. |
| `src/utils/flyoverPlayback.ts` | Pure: advances progress by frame time, speed and duration. |
| `src/utils/flyoverConfig.ts` | Reads the MapTiler key from the environment. |
| `src/utils/flyoverStyle.ts` | Pure: builds the MapLibre style object and the route `line-gradient` expression. |
| `src/utils/flyoverStats.ts` | Pure: formats the overlay's readouts for a position on the route. |
| `src/components/FlyoverTab.tsx` | `React.lazy` + `Suspense` + error boundary around `FlyoverView`. Keeps `maplibre-gl` out of the main chunk. |
| `src/components/FlyoverView.tsx` | Owns the MapLibre map and the animation loop. |
| `src/components/FlyoverControls.tsx` | Presentational: the stats panel and the playback control bar. |
| `src/__tests__/flyoverFixtures.ts` | Shared test helpers for building synthetic routes. Not a test file. |
| `src/__tests__/geo.test.ts` | Unit tests for the geometry helpers. |
| `src/__tests__/flyoverHeading.test.ts` | Unit tests for heading computation. |
| `src/__tests__/flyoverRoute.test.ts` | Unit tests for route building and interpolation. |
| `src/__tests__/flyoverCamera.test.ts` | Unit tests for the chase cam. |
| `src/__tests__/flyoverPlayback.test.ts` | Unit tests for progress advancement. |
| `src/__tests__/flyoverConfig.test.ts` | Unit tests for reading the key. |
| `src/__tests__/flyoverStyle.test.ts` | Unit tests for the style and gradient builders. |
| `src/__tests__/flyoverStats.test.ts` | Unit tests for the overlay formatting. |

### Modified

| File | Change |
|---|---|
| `src/utils/gpxParser.ts` | Import `haversineMeters` from `geo.ts` instead of defining it and `EARTH_RADIUS_M`. No behaviour change. |
| `src/utils/tabAvailability.ts` | Add `'flyover'` to `Tab`, with its disabled reasons. Not added to `defaultTab`'s preference lists. |
| `src/__tests__/tabAvailability.test.ts` | Cover the new tab. |
| `src/App.tsx` | Add the **3D** tab (Lucide `Mountain` icon) rendering `<FlyoverTab records={fitData.records} />`. |
| `package.json` | Add `maplibre-gl` (^6.11). |
| `.github/workflows/deploy.yml` | Pass `VITE_MAPTILER_KEY: ${{ secrets.MAPTILER_KEY }}` to the `npm run build` step. |
| `README.md` | Feature bullet, plus a section on getting and restricting a MapTiler key. |

No `.env.example`: the repo's `.gitignore` excludes `.env.*`, so it would never be
committed. The README documents the variable instead.

## Decisions

Settled during brainstorming. Push back if any turn out to be wrong in practice.

1. **Engine:** MapLibre GL JS, with no MapTiler SDK wrapper. The style is built by hand from MapTiler tile endpoints.
2. **Imagery:** MapTiler `satellite-v2` raster, with `terrain-rgb-v2` as `raster-dem`. Terrain exaggeration is fixed at 1, so terrain heights are true metres.
3. **Playback:** in-app only. 60 s for the whole route at 1×, with speeds 0.5× / 1× / 2× / 4×, play/pause, restart and a scrubber.
4. **Animation axis is distance, never time**, for every file. Time-based playback stalls at stops; distance gives one code path and a steady pace. Timed files still show elapsed time in the overlay.
5. **The distance axis is Web-Mercator length**, not metres. MapLibre's `line-progress` comes from `geojson-vt`, which measures line length in projected spherical-Mercator units (verified in `@maplibre/geojson-vt` 6.x, `src/convert.ts`, `convertLine`). If the animation used metres instead, the bright/faint boundary would drift away from the rider marker by latitude. Displayed distance is still in metres.
6. **Chase camera:** 200 m behind the rider and 100 m above, facing forward.
7. **Heading is precomputed per route point**, not tracked during playback. It starts from a chord bearing, 150 m behind to 150 m ahead. Chords too crooked to mean anything (U-turns, GPS drift at stops) are discarded and filled from their neighbours, and the result is smoothed over ±150 m in unwrapped degrees. The camera is a function of the route and the progress alone, so scrubbing from either direction gives the same view. A turnaround becomes a gradual rotation instead of a 180° snap.
8. **Terrain clamp:** the camera stays at least 30 m above the ground directly beneath it.
9. **The rider marker sits on the terrain**, not at the recorded altitude. The overlay reports the recorded altitude.
10. **Traveled route** is drawn with `line-gradient` stepped on `line-progress`, updated with one `setPaintProperty` per frame. The GeoJSON is never re-sliced.
11. **Interaction:** map gestures are disabled while playing. When paused you can look around freely, and resuming snaps back to the chase view.
12. **3D is never the default tab**, because every view spends tile quota.
13. **No key → the tab is disabled** with a reason. The build still succeeds without the secret.

## Architecture

### Data flow

1. `App` renders `<FlyoverTab records={fitData.records} />` when the 3D tab is active.
2. `FlyoverTab` lazy-loads `FlyoverView`. A chunk-load or map-startup failure is caught by its error boundary.
3. `FlyoverView` builds the route with `useMemo(() => buildRoute(records))`, creates the map on mount, and on `load` adds terrain, the sky, the route and the rider.
4. A `requestAnimationFrame` loop runs, and on each frame:
   1. `progress = advance(progress, dt, speed)` (only while playing);
   2. `pose = chaseCamera(route, progress, p => map.queryTerrainElevation(p))`;
   3. `map.jumpTo(map.calculateCameraOptionsFromTo(from, fromAltitude, to, toAltitude))`;
   4. `map.setPaintProperty('route', 'line-gradient', routeGradient(progress))`;
   5. the rider source gets `setData` with one point.
5. The progress React state (which drives the scrubber and the overlay) is set at most every 100 ms (10 Hz). The live value lives in a ref, so frames don't re-render React.
6. Unmount cancels the animation frame and calls `map.remove()`.

`records` never changes under a mounted view: loading a new file switches to
`defaultTab`, which is never `'flyover'`, so the view unmounts first.

The pure modules never import `maplibre-gl` at runtime. Only `flyoverStyle`
uses it, and only as `import type`. That keeps tests free of WebGL and keeps the
library out of the main chunk.

### `geo.ts`

```ts
export interface LngLatPoint { lng: number; lat: number; }

/** Moved unchanged from gpxParser.ts. */
export const EARTH_RADIUS_M = 6_371_000;

/** Moved unchanged from gpxParser.ts. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number;

/** Initial great-circle bearing, degrees clockwise from north, in [0, 360). */
export function bearingDeg(from: LngLatPoint, to: LngLatPoint): number;

/** The point `meters` along `bearing` from `from`, on the same sphere. */
export function destinationPoint(from: LngLatPoint, bearing: number, meters: number): LngLatPoint;

/** Spherical Mercator in [0, 1]. Must match @maplibre/geojson-vt projectX/projectY exactly. */
export function mercatorX(lng: number): number; // lng / 360 + 0.5
export function mercatorY(lat: number): number; // 0.5 - 0.25 * ln((1 + sin φ) / (1 - sin φ)) / π, clamped to [0, 1]
```

### `flyoverHeading.ts`

```ts
export const HEADING_WINDOW_M = 150;
export const MIN_STRAIGHTNESS = 0.25;

/** Heading at every point, in unwrapped degrees. */
export function computeHeadings(points: LngLatPoint[], windowM?: number): number[];
```

Distances here are cumulative ground metres (haversine) along the points.
There are three passes, and each one fixes a failure of the one before:

1. **Chord.** For each point, take the positions `windowM` behind and ahead
   along the route (clamped to the ends), and the bearing from one to the
   other. Jitter at or near the point barely moves it.
2. **Discard and fill.** A chord shorter than `MIN_STRAIGHTNESS` × the path
   between its ends means the route folds back inside the window: a U-turn, or
   GPS drift at a stop. That chord's bearing is meaningless, so it is discarded.
   The valid bearings are unwrapped in sequence, each step taking the shortest
   delta in [−180, 180), so an exact reversal turns −180°. Discarded points are
   then filled by linear interpolation of their valid neighbours in unwrapped
   space, by ground distance. Points before the first valid value, or after the
   last, copy it. If no chord is valid at all, every point gets the bearing from
   the first point to the last.
3. **Smooth.** Take the mean of the filled heading over ±`windowM` of ground
   distance, treating it as piecewise linear. It is weighted by *distance*, not
   by sample. A per-sample average fails twice: a stop's many dense fixes
   outvote the road, and the mean jumps whenever a sample crosses the window
   edge. The distance-weighted mean is continuous, and turns the remaining flip
   at a turnaround into a rotation of at most 180° / (2 × `windowM`), which is
   6° per 10 m.

Values are unwrapped: consecutive values never differ by 180° or more, so
interpolating between two points never swings the long way round. Consumers take
the value modulo 360 only at the point of use.

### `flyoverRoute.ts`

```ts
export interface RoutePoint {
  lng: number;
  lat: number;
  m: number;            // cumulative Web-Mercator length: the animation axis
  distance: number;     // metres, for display
  heading: number;      // unwrapped degrees, from computeHeadings
  elevation?: number;   // recorded: enhanced_altitude ?? altitude
  elapsed?: number;     // seconds since the first timed point
  heartRate?: number;
  speed?: number;       // m/s: speed ?? enhanced_speed
}

/** A point interpolated anywhere along the route; same shape as RoutePoint. */
export type RoutePosition = RoutePoint;

export interface Route {
  points: RoutePoint[];  // ≥ 2, strictly increasing m
  totalM: number;        // > 0
  totalDistance: number; // metres
  timed: boolean;        // every point has a timestamp
}

/** null when there are fewer than 2 distinct usable GPS positions. */
export function buildRoute(records: FitRecord[]): Route | null;

/** True exactly when buildRoute(records) would return a route. Cheap: stops at the second distinct position. */
export function hasFlyoverRoute(records: FitRecord[]): boolean;

/** progress ∈ [0, 1], clamped. */
export function positionAt(route: Route, progress: number): RoutePosition;

/** m ∈ [0, totalM], clamped. */
export function positionAtM(route: Route, m: number): RoutePosition;
```

Rules:

- **A position is usable** when both coordinates are finite numbers, the
  latitude is within ±85.051129° (the Web-Mercator limit, beyond which MapLibre
  can't draw and distinct points can project to the same place), the longitude
  is within ±180°, and it is not exactly (0, 0). Devices write (0, 0) before
  they have a fix, and following it would fly the camera across the planet,
  spending tile quota on the way. Records without a usable position are skipped.
- **Consecutive identical positions collapse into the first.** They would add
  zero `m`, and equal `m` values break interpolation. The HR and speed recorded
  at a stop are lost, but they don't correspond to any motion anyway. Collapsing
  is what makes `m` strictly increasing and `totalM > 0`.
- **`distance` source:** use `record.distance` if *every* kept point has a
  numeric one; otherwise use cumulative `haversineMeters` for all points. It's
  never mixed, so displayed distance never jumps. GPX always takes the
  recorded path, since `gpxParser` derives it.
- **`speed`** is `speed ?? enhanced_speed`, and **`elevation`** is
  `enhanced_altitude ?? altitude`. Some devices write only the enhanced fields.
- **`elapsed`** is `(timestamp − first timestamp) / 1000`, measured from the
  first point that has one. It uses the same source for FIT and GPX, and ignores
  `elapsed_time` from the parser.
- **Interpolation:** binary search on `m` for the bracketing pair, then lerp
  `lng`, `lat`, `distance`, `heading`, and every optional field present at both
  ends. A field present at only one end takes that end's value, so a single
  dropped sensor reading doesn't blink the readout. A field absent at both ends
  is `undefined`.
- No GPS outlier filtering in v1 (see Out of scope).

### `flyoverCamera.ts`

```ts
export interface CameraConfig {
  behindM: number;    // 200
  aboveM: number;     // 100
  clearanceM: number; // 30
}
export const DEFAULT_CAMERA: CameraConfig;
export const MAX_PITCH = 75;

/** Terrain height in metres, or null when tiles are not loaded yet. */
export type GroundAt = (p: LngLatPoint) => number | null;

export interface CameraPose {
  from: LngLatPoint;
  fromAltitude: number; // metres above sea level
  to: LngLatPoint;      // the rider
  toAltitude: number;
  heading: number;      // degrees in [0, 360), camera faces this way
}

export function chaseCamera(route: Route, progress: number, groundAt: GroundAt, config?: CameraConfig): CameraPose;

/** Angle of the line of sight from vertical, in degrees, derived from the pose alone. */
export function pitchDeg(pose: CameraPose): number;
```

Placement at `rider = positionAt(route, progress)`:

1. `heading = rider.heading` modulo 360.
2. `toAltitude = groundAt(rider) ?? rider.elevation ?? 0`.
3. `from = destinationPoint(rider, heading + 180, behindM)`.
4. `fromAltitude = max(toAltitude + aboveM, (groundAt(from) ?? toAltitude) + clearanceM)`.

`pitchDeg` is `atan2(haversine(from, to), fromAltitude − toAltitude)`. The map is
created with `maxPitch: MAX_PITCH`. On flat ground the default geometry gives
`atan(200 / 100) ≈ 63.4°`, and the clamp only ever raises the camera, which
lowers the pitch. If a pose ever exceeded `maxPitch`, `jumpTo` would clamp it
silently and the rider would slide off-centre. A test pins the invariant.

### `flyoverPlayback.ts`

```ts
export const BASE_DURATION_MS = 60_000;
export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];
export const MAX_FRAME_MS = 100;

/** Returns the new progress, clamped to [0, 1]. */
export function advance(progress: number, dtMs: number, speed: number, durationMs?: number): number;

/** Where pressing play starts: from the top when the previous run finished. */
export function playFrom(progress: number): number;
```

`dtMs` is clamped to [0, `MAX_FRAME_MS`]. The browser stops animation frames for
background tabs, and without the clamp the first frame after returning would
jump a long way along the route.

### `flyoverConfig.ts` and `flyoverStyle.ts`

```ts
// flyoverConfig.ts
/** Trimmed VITE_MAPTILER_KEY, or undefined when unset or blank. Read at call time. */
export function mapTilerKey(): string | undefined;

// flyoverStyle.ts
export const SATELLITE_TILE_SIZE: number;
export const TERRAIN_TILE_SIZE: number;
export const TRAVELED_COLOR = '#3b82f6';
export const AHEAD_COLOR = 'rgba(255, 255, 255, 0.45)';
export function buildStyle(key: string): StyleSpecification;
export function routeGradient(progress: number): ExpressionSpecification;
```

- `mapTilerKey` reads `import.meta.env` inside the function, not at module load,
  so tests can use `vi.stubEnv`.
- **`buildStyle`** returns `version: 8` with two sources:
  - `satellite`: `raster`, `url: https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=…`, `tileSize: SATELLITE_TILE_SIZE`;
  - `terrain`: `raster-dem`, `url: https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=…`, `tileSize: TERRAIN_TILE_SIZE`.

  It has one layer, the `satellite` raster. The key is URL-encoded.
- **Unverified until a key exists:** the tileset names and the two tile sizes.
  MapTiler returns 403 for *any* tileset without a key, including made-up names,
  so a key-less probe proves nothing. It also serves 256 px and 512 px variants,
  and a `tileSize` that doesn't match the tiles renders them blurry or too small.
  The sizes start at 256, and the keyed verification task confirms or corrects
  all three.
- **`routeGradient`** returns `['step', ['line-progress'], TRAVELED_COLOR, p, AHEAD_COLOR]`,
  with `p` clamped to [0, 1]. The traveled colour matches the Leaflet route.

### `flyoverStats.ts`

```ts
export interface Stat { label: string; value: string; }
export function flyoverStats(position: RoutePosition, route: Route): Stat[];
```

These readouts, in this order, each shown only when its value exists:

| Label | Value |
|---|---|
| `Distance` | `<done> / <total>`, each km to 2 dp from 1 km up and whole metres below, as `SummaryCards` formats it |
| `Elevation` | recorded, rounded: `612 m` |
| `Speed` | via `MS_TO_KMH`, 1 dp: `29.7 km/h` |
| `Heart rate` | rounded: `152 bpm` |
| `Time` | `formatDuration(elapsed)`, only when `route.timed` |

Missing fields are hidden, not shown as zero.

### `FlyoverView.tsx` and `FlyoverControls.tsx`

- **`FlyoverView` props:** `{ records: FitRecord[] }`. It gets the same card
  chrome as `MapView`, 520 px tall, and follows the app's dark classes.
- **WebGL is probed before any map is created**, once per page load, and the
  probe context is released immediately. Without that, every probe on a tab
  switch would count toward the browser's limit on live WebGL contexts.
- **Map options:** `style: buildStyle(key)`, `maxPitch: MAX_PITCH`, and the
  default attribution control left on, because MapTiler and OpenStreetMap terms
  require attribution.
- **On `load`:**
  - `setTerrain({ source: 'terrain', exaggeration: 1 })` and `setSky(...)`;
  - a `route` GeoJSON source built from `route.points`, never the raw records,
    with **`lineMetrics: true`**, which `line-gradient` requires, and its line
    layer;
  - a `rider` GeoJSON source with a circle layer;
  - one frame drawn at progress 0.
- **Controls (`FlyoverControls`):**
  - play/pause and restart;
  - a range input (0–1000) bound to progress;
  - speed buttons from `SPEEDS`.

  Play uses `playFrom`, so pressing it after the end starts again from the top.
  Scrubbing while paused redraws one frame at the new position.
- **Gestures:** while playing, `dragPan`, `dragRotate`, `scrollZoom`,
  `touchZoomRotate`, `doubleClickZoom` and `keyboard` are disabled. They are
  re-enabled on pause, and when playback reaches the end.
- **Overlay (`FlyoverStatsPanel`)** shows `flyoverStats(positionAt(route, progress), route)`.
- `route === null`, or a missing key, never reaches here, because the tab is
  disabled first. If either somehow does, the view renders the matching tab
  reason and creates no map.

### `tabAvailability.ts`

Disabled reasons for `'flyover'` are checked in this order:

1. `!hasFlyoverRoute(records)` → `FLYOVER_NO_ROUTE` = `Not enough GPS data for a 3D flyover`.
2. `mapTilerKey()` undefined → `FLYOVER_NO_KEY` = `3D view isn't configured (no MapTiler key)`.

Both strings are exported constants, and `FlyoverView` reuses them for its own
defensive messages, so the two can't drift apart.

The file's own problem is reported ahead of the app's. `defaultTab`'s preference
lists are unchanged, so `'flyover'` is never the tab a file opens on.

## Error handling

| Situation | Behaviour |
|---|---|
| No MapTiler key at build time | Tab disabled with a reason. Build succeeds. |
| Chunk fails to load (offline, or a deploy replaced it) | `FlyoverTab`'s error boundary shows "Couldn't load the 3D view. Check your connection and reload." |
| No WebGL (the probe finds no context) | A message in the tab: "The 3D view needs WebGL, which this browser isn't providing." |
| Map constructor throws anyway | Caught by the same error boundary. |
| Tile error 401/403 | Banner: "MapTiler rejected the key." |
| Tile error 429 | Banner: "MapTiler's monthly quota is used up." |
| Other tile errors | Ignored, since they're usually transient. MapLibre retries on the next view. |
| Terrain not loaded yet | `groundAt` returns `null`, and the camera uses recorded elevation until tiles arrive. |

The status codes are read from `e.error.status` in the map's `error` event
(`ErrorEvent.error` is typed `ErrorLike`, so the read is defensive). The keyed
verification task confirms the field, triggering the 403 case with a
deliberately bad key.

## Testing

Unit tests run in Vitest with happy-dom. None of them touch WebGL or the network.
Tests that need "no key" stub `VITE_MAPTILER_KEY` to `''` explicitly: Vitest
loads `.env` files, so a developer's `.env.local` would otherwise leak in.

### `geo.test.ts`

- `bearingDeg`: due north is 0, due east is 90, due south is 180, due west is 270.
- `destinationPoint` followed by `haversineMeters` recovers the distance to within 0.1 %, and `bearingDeg` recovers the bearing.
- `mercatorX`/`mercatorY` are identical to geojson-vt's formulas at several points, including the clamp at the poles.
- The existing `gpxParser` tests pass unchanged, which shows the move didn't alter any distance.

### `flyoverHeading.test.ts`

- A straight eastbound route has heading ≈ 90° everywhere.
- A 90° left turn goes from ≈ 90° to ≈ 0°, never increasing, and never more than 7.5° per 10 m.
- **An out-and-back on the same road** reads ≈ 90° well before the turnaround and ≈ 270° well after it. Every value is finite, and no step exceeds 7.5° per 10 m.
- **GPS drift at a stop** (60 points alternating 3 m either side of the road) keeps every heading within 10° of the road's.
- A 30 m sideways jitter point changes the heading at that point by less than 1°.
- A two-point route gets the segment's bearing at both points.
- A route where every chord is crooked still gets finite headings.

### `flyoverRoute.test.ts`

- It returns `null` for no GPS, a single point, and all-identical points. `hasFlyoverRoute` agrees with `buildRoute` on every fixture.
- (0, 0), non-finite and out-of-range positions (including latitudes past the Web-Mercator limit) are skipped.
- Consecutive duplicate positions collapse, and `m` is strictly increasing.
- **The animation axis is Mercator, not metres:** two segments of equal ground length, at the equator and at 60°, differ in progress share by a factor of 2.
- It uses recorded `distance` when every point has one, and haversine for all points when any point lacks it.
- `positionAt` at 0, ½ and 1 gives the start, the interpolated midpoint and the end, and out-of-range progress is clamped.
- Optional fields are interpolated when present at both ends, take that end's value when present at one, and are `undefined` when present at neither.
- `speed` falls back to `enhanced_speed`, and `elevation` prefers `enhanced_altitude`.
- `timed` is true only when every point has a timestamp. `elapsed` counts from the first timestamp.

### `flyoverCamera.test.ts`

- On a straight northbound route, the camera is 200 m due south of the rider.
- After a 90° turn, the camera ends up behind the new direction.
- Scrubbing forwards to a point and backwards to the same point gives identical poses.
- With a synthetic ridge behind the rider, `fromAltitude` is at least ridge + 30 m, and the pitch drops.
- With `groundAt` returning `null`, the recorded elevation is used, or 0 when there is none.
- The default geometry on flat ground gives `pitchDeg ≤ MAX_PITCH`.

### `flyoverPlayback.test.ts`

- At 1×, a second of 60 fps frames advances 1/60.
- 2× doubles that.
- Progress clamps at 1.
- A 5 s `dt` advances only `MAX_FRAME_MS` worth, and a negative `dt` advances nothing.
- `playFrom(1)` is 0, and any other progress is unchanged.

### `flyoverStyle.test.ts`, `flyoverStats.test.ts` and `tabAvailability.test.ts`

- The style has both sources with the key in their URLs, and the key is URL-encoded.
- `routeGradient` clamps `p`, and has the traveled colour below it and the ahead colour above.
- The stats show every readout in the table's format, hide missing ones, and hide `Time` for an untimed route.
- With a stubbed key and a two-point GPS track, the tab is enabled.
- With no key, it's disabled with the config reason.
- A no-GPS or single-position file gets the GPS reason even without a key.
- `defaultTab` never returns `'flyover'`.

### Manual verification

These need a real MapTiler key (in `.env.local` as `VITE_MAPTILER_KEY`) and
real iGPSport exports:

1. The tileset names and tile sizes from `buildStyle` load sharp satellite imagery on visible terrain.
2. A hilly ride (the largest file, 2026-08-15, 122 km) plays through without the camera entering terrain on descents.
3. The bright/faint boundary stays under the rider marker for the whole ride.
4. An out-and-back ride turns around smoothly, with no snap.
5. Pausing, dragging to look around, then resuming snaps back to the chase view.
6. Switching tabs away and back 20 times produces no "Too many active WebGL contexts" warning in the console.
7. An untimed GPX plays, with the Time readout hidden.
8. A deliberately bad key shows the 403 banner.
9. `npm run build` puts `maplibre-gl` in its own chunk, and the main chunk stays at or below 358.12 KB gzipped. The baseline at `e5d23fe` is 353.12 KB.

## Pre-commit gate

Per `CLAUDE.md`: `npm test` and `npm run build` both pass with zero errors before
any commit.

## Deployment

The owner needs to:

1. Create a MapTiler account and key.
2. Restrict the key's allowed origins to `https://fit-file-viewer.web.app`,
   `https://fit-file-viewer.firebaseapp.com` (Firebase serves both),
   `http://localhost:5173` (dev) and `http://localhost:4173` (preview).
3. Add the key as the `MAPTILER_KEY` GitHub Actions secret.

Until step 3 is done, production deploys with the tab disabled.

## Out of scope (deliberately deferred)

- Video export.
- Google Photorealistic 3D Tiles.
- Map labels and roads over the satellite imagery.
- An expand/fullscreen toggle. `MapView`'s pattern can be reused later.
- Other camera modes: orbit, overhead, free.
- GPS outlier filtering. A teleporting fix makes the camera jump.
- A terrain exaggeration control.
- Photos along the route, and multiple activities.

## Revisions

**2026-09-25, during planning.** The approved heading design took the bearing
from 150 m behind the rider to 150 m ahead, computed per frame. Two common
inputs break it:

- **Out-and-back routes.** At the turnaround the chord collapses to zero
  length, so the heading snaps 180° within about 75 m of route (a fraction of a
  second at playback speed), and it is undefined at the apex itself.
- **GPS drift at stops.** A per-segment approach would spin the camera at every
  traffic light.

Heading is now precomputed per route point, as set out in `flyoverHeading.ts`.
The camera no longer takes a `headingWindowM`. Other changes made alongside it:

- (0, 0) and invalid positions are skipped.
- `speed` falls back to `enhanced_speed`.
- `playFrom` restarts a finished run.
- WebGL is probed once, up front, rather than detected by the constructor
  throwing.
- Overlay formatting is its own tested module, and the controls are a separate
  presentational component.
- A field known at only one interpolation end now takes that end's value.
- Usable latitudes stop at the Web-Mercator limit.
- `metersPerMercatorUnit` was dropped, since nothing needed it once heading
  moved to ground metres.
- The tab's two disabled reasons became shared constants.
- The heading smoothing is weighted by distance. A dry run of the plan's code
  showed that a per-sample moving average stepped 9° at a turnaround: it
  flickers as samples cross the window edge. The distance-weighted mean
  measured 6.0°.
