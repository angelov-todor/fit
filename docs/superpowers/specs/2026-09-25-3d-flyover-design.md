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
| `src/utils/flyoverRoute.ts` | Pure: `FitRecord[] → Route`, plus `positionAt` / `positionAtM` interpolation along it. |
| `src/utils/flyoverCamera.ts` | Pure: `(Route, progress, groundAt) → CameraPose`. Chase-cam placement, heading, terrain clamp. |
| `src/utils/flyoverPlayback.ts` | Pure: advances progress by frame time, speed and duration. |
| `src/utils/flyoverConfig.ts` | Reads the MapTiler key from the environment. |
| `src/utils/flyoverStyle.ts` | Pure: builds the MapLibre style object and the route `line-gradient` expression. |
| `src/components/FlyoverTab.tsx` | `React.lazy` + `Suspense` + error boundary around `FlyoverView`. Keeps `maplibre-gl` out of the main chunk. |
| `src/components/FlyoverView.tsx` | Owns the MapLibre map, the animation loop, the controls and the stats overlay. |
| `src/__tests__/geo.test.ts` | Unit tests for the geometry helpers. |
| `src/__tests__/flyoverRoute.test.ts` | Unit tests for route building and interpolation. |
| `src/__tests__/flyoverCamera.test.ts` | Unit tests for the chase cam. |
| `src/__tests__/flyoverPlayback.test.ts` | Unit tests for progress advancement. |
| `src/__tests__/flyoverStyle.test.ts` | Unit tests for the style and gradient builders. |

### Modified

| File | Change |
|---|---|
| `src/utils/gpxParser.ts` | Import `haversineMeters` and `EARTH_RADIUS_M` from `geo.ts` instead of defining them. No behaviour change. |
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
7. **Heading is stateless:** the bearing from 150 m behind the rider to 150 m ahead. Scrubbing to any point, from either direction, gives the same camera.
8. **Terrain clamp:** the camera stays at least 30 m above the ground directly beneath it.
9. **The rider marker sits on the terrain**, not at the recorded altitude. The overlay reports the recorded altitude.
10. **Traveled route** is drawn with `line-gradient` stepped on `line-progress`, updated with one `setPaintProperty` per frame. The GeoJSON is never re-sliced.
11. **Interaction:** map gestures are disabled while playing. When paused you can look around freely, and resuming snaps back to the chase view.
12. **3D is never the default tab**, because every view spends tile quota.
13. **No key → the tab is disabled** with a reason. The build still succeeds without the secret.

## Architecture

### Data flow

1. `App` renders `<FlyoverTab records={fitData.records} />` when the 3D tab is active.
2. `FlyoverTab` lazy-loads `FlyoverView`. A chunk-load failure is caught by its error boundary.
3. `FlyoverView` builds the route with `useMemo(() => buildRoute(records))`, creates the map on mount, and on `load` adds terrain, the sky, the route and the rider.
4. A `requestAnimationFrame` loop runs, and on each frame:
   1. `progress = advance(progress, dt, speed)` (only while playing);
   2. `pose = chaseCamera(route, progress, p => map.queryTerrainElevation(p))`;
   3. `map.jumpTo(map.calculateCameraOptionsFromTo(from, fromAltitude, to, toAltitude))`;
   4. `map.setPaintProperty('route', 'line-gradient', routeGradient(progress))`;
   5. the rider source gets `setData` with one point.
5. Stats overlay state is set at most every 100 ms (10 Hz). Progress lives in a ref, so frames don't re-render React.
6. Unmount cancels the animation frame and calls `map.remove()`.

The pure modules (`geo`, `flyoverRoute`, `flyoverCamera`, `flyoverPlayback`,
`flyoverStyle`) never import `maplibre-gl` at runtime. Only `flyoverStyle` uses
it, and only as `import type`. That keeps tests free of WebGL and keeps the
library out of the main chunk.

### `geo.ts`

```ts
export interface LngLatPoint { lng: number; lat: number; }

/** Moved unchanged from gpxParser.ts. */
export const EARTH_RADIUS_M = 6_371_000;

/** Circumference of the same sphere, so Mercator scale agrees with haversine. */
export const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M;

/** Moved unchanged from gpxParser.ts. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number;

/** Initial great-circle bearing, degrees clockwise from north, in [0, 360). */
export function bearingDeg(from: LngLatPoint, to: LngLatPoint): number;

/** The point `meters` along `bearing` from `from`, on the same sphere. */
export function destinationPoint(from: LngLatPoint, bearing: number, meters: number): LngLatPoint;

/** Spherical Mercator in [0, 1]. Must match @maplibre/geojson-vt projectX/projectY exactly. */
export function mercatorX(lng: number): number; // lng / 360 + 0.5
export function mercatorY(lat: number): number; // 0.5 - 0.25 * ln((1 + sin φ) / (1 - sin φ)) / π, clamped to [0, 1]

/** Ground metres per unit of Mercator length at `lat`. */
export function metersPerMercatorUnit(lat: number): number; // EARTH_CIRCUMFERENCE_M * cos φ
```

### `flyoverRoute.ts`

```ts
export interface RoutePoint {
  lng: number;
  lat: number;
  m: number;            // cumulative Web-Mercator length: the animation axis
  distance: number;     // metres, for display
  elevation?: number;   // recorded: enhanced_altitude ?? altitude
  elapsed?: number;     // seconds since the first timed point
  heartRate?: number;
  speed?: number;       // m/s
}

/** A point interpolated anywhere along the route; same shape as RoutePoint. */
export type RoutePosition = RoutePoint;

export interface Route {
  points: RoutePoint[];  // ≥ 2, strictly increasing m
  totalM: number;        // > 0
  totalDistance: number; // metres
  timed: boolean;        // every point has elapsed
}

/** null when there are fewer than 2 distinct GPS positions. */
export function buildRoute(records: FitRecord[]): Route | null;

/** progress ∈ [0, 1], clamped. */
export function positionAt(route: Route, progress: number): RoutePosition;

/** m ∈ [0, totalM], clamped. Used for the camera's look-behind and look-ahead. */
export function positionAtM(route: Route, m: number): RoutePosition;
```

Rules:

- Records without `position_lat`/`position_long` are skipped.
- **Consecutive identical positions collapse into the first.** They would add
  zero `m`, and equal `m` values break interpolation. The HR and speed recorded
  at a stop are lost, but they don't correspond to any motion anyway. Collapsing
  is what makes `m` strictly increasing and `totalM > 0`.
- **`distance` source:** use `record.distance` if *every* kept point has a
  numeric one; otherwise use cumulative `haversineMeters` for all points. It's
  never mixed, so displayed distance never jumps. GPX always takes the
  recorded path, since `gpxParser` derives it.
- **`elapsed`** is `(timestamp − first timestamp) / 1000`. It uses the same
  source for FIT and GPX, and ignores `elapsed_time` from the parser.
- **Interpolation:** binary search on `m` for the bracketing pair, then lerp
  `lng`, `lat`, `distance`, and every numeric optional field present at both
  ends. A field present at only one end takes the nearer point's value, and a
  field absent at both ends is `undefined`.
- No GPS outlier filtering in v1 (see Out of scope).

### `flyoverCamera.ts`

```ts
export interface CameraConfig {
  behindM: number;        // 200
  aboveM: number;         // 100
  clearanceM: number;     // 30
  headingWindowM: number; // 150
}
export const DEFAULT_CAMERA: CameraConfig;

/** Terrain height in metres, or null when tiles are not loaded yet. */
export type GroundAt = (p: LngLatPoint) => number | null;

export interface CameraPose {
  from: LngLatPoint;
  fromAltitude: number; // metres above sea level
  to: LngLatPoint;      // the rider
  toAltitude: number;
  heading: number;      // degrees, camera faces this way
}

export function chaseCamera(route: Route, progress: number, groundAt: GroundAt, config?: CameraConfig): CameraPose;

/** Angle of the line of sight from vertical, in degrees, derived from the pose alone. */
export function pitchDeg(pose: CameraPose): number;
```

Placement at `rider = positionAt(route, progress)`:

1. `window = headingWindowM / metersPerMercatorUnit(rider.lat)`, which turns the
   metre window into Mercator length at the rider's latitude.
2. `heading = bearingDeg(positionAtM(m − window), positionAtM(m + window))`,
   with both ends clamped to `[0, totalM]`. The ends always differ, because
   `totalM > 0` and the window is positive.
3. `toAltitude = groundAt(rider) ?? rider.elevation ?? 0`.
4. `from = destinationPoint(rider, heading + 180, behindM)`.
5. `fromAltitude = max(toAltitude + aboveM, (groundAt(from) ?? toAltitude) + clearanceM)`.

`pitchDeg` is `atan2(haversine(from, to), fromAltitude − toAltitude)`. The map is
created with `maxPitch: 75`. On flat ground the default geometry gives
`atan(200 / 100) ≈ 63.4°`, and the clamp only ever raises the camera, which
lowers the pitch. If a pose ever exceeded `maxPitch`, `jumpTo` would clamp it
silently and the rider would slide off-centre. A test pins the invariant.

**Limit of the smoothing:** jitter near the rider barely affects the heading,
but a jittered point landing exactly at a window end shifts it by up to
`atan(offset / (2 × headingWindowM))`. For a 30 m offset that is about 5.7°,
which is acceptable for a camera, and is why the window is 150 m and not less.

### `flyoverPlayback.ts`

```ts
export const BASE_DURATION_MS = 60_000;
export const SPEEDS = [0.5, 1, 2, 4] as const;
export const MAX_FRAME_MS = 100;

/** Returns the new progress, clamped to [0, 1]. */
export function advance(progress: number, dtMs: number, speed: number, durationMs?: number): number;
```

`dtMs` is clamped to `MAX_FRAME_MS`. The browser stops animation frames for
background tabs, and without the clamp the first frame after returning would
jump a long way along the route.

### `flyoverConfig.ts` and `flyoverStyle.ts`

```ts
// flyoverConfig.ts
/** Trimmed VITE_MAPTILER_KEY, or undefined when unset or blank. Read at call time. */
export function mapTilerKey(): string | undefined;

// flyoverStyle.ts
export function buildStyle(key: string): StyleSpecification;
export function routeGradient(progress: number): ExpressionSpecification;
```

- `mapTilerKey` reads `import.meta.env` inside the function, not at module load,
  so tests can use `vi.stubEnv`.
- **`buildStyle`** returns `version: 8` with two sources:
  - `satellite`: `raster`, `url: https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=…`;
  - `terrain`: `raster-dem`, `url: https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=…`.

  It has one layer, the `satellite` raster. The key is URL-encoded.
- **Unverified until a key exists:** the tileset names, and each source's
  `tileSize`. MapTiler returns 403 for *any* tileset without a key, including
  made-up names, so a key-less probe proves nothing. It also serves 256 px and
  512 px variants, and a `tileSize` that doesn't match the tiles renders them
  blurry or too small. The first task with a real key confirms both and records
  them in `flyoverStyle.ts`.
- **`routeGradient`** returns `['step', ['line-progress'], TRAVELED, p, AHEAD]`,
  with `p` clamped to [0, 1]. Colours: traveled `#3b82f6`, matching the Leaflet
  route; ahead `rgba(255, 255, 255, 0.45)`.

### `FlyoverView.tsx`

- **Props:** `{ records: FitRecord[] }`. It gets the same card chrome as
  `MapView`, 520 px tall, and follows the app's dark classes.
- **Map options:** `style: buildStyle(key)`, `maxPitch: 75`, and
  `attributionControl` left on, because MapTiler and OpenStreetMap terms
  require attribution.
- **On `load`:**
  - `setTerrain({ source: 'terrain', exaggeration: 1 })` and `setSky(...)`;
  - a `route` GeoJSON source with **`lineMetrics: true`**, which `line-gradient`
    requires, and its line layer;
  - a `rider` GeoJSON source with a circle layer;
  - one frame drawn at progress 0.
- **Controls:**
  - play/pause and restart;
  - a range input (0–1000) bound to progress;
  - speed buttons from `SPEEDS`.

  Scrubbing while paused redraws one frame at the new position.
- **Gestures:** while playing, `dragPan`, `dragRotate`, `scrollZoom`,
  `touchZoomRotate`, `doubleClickZoom` and `keyboard` are disabled. They are
  re-enabled on pause.
- **Overlay:**
  - distance done / total, formatted as `SummaryCards` does: km to 2 dp from
    1 km up, whole metres below;
  - recorded elevation, m;
  - speed, km/h via `MS_TO_KMH`;
  - HR, when present;
  - elapsed time, when `route.timed`.

  Missing fields are hidden, not shown as zero.
- `route === null` never reaches here, because the tab is disabled first. If it
  somehow does, the view renders the same "not enough GPS data" message and
  does nothing else.

### `tabAvailability.ts`

Disabled reasons for `'flyover'` are checked in this order:

1. Fewer than 2 distinct GPS positions → `Not enough GPS data for a 3D flyover`.
2. `mapTilerKey()` undefined → `3D view isn't configured (no MapTiler key)`.

The file's own problem is reported ahead of the app's. `defaultTab`'s preference
lists are unchanged, so `'flyover'` is never the tab a file opens on.

## Error handling

| Situation | Behaviour |
|---|---|
| No MapTiler key at build time | Tab disabled with a reason. Build succeeds. |
| Chunk fails to load (offline, or a deploy replaced it) | `FlyoverTab`'s error boundary shows "Couldn't load the 3D view. Check your connection and reload." |
| No WebGL (the `Map` constructor throws) | A message in the tab: "The 3D view needs WebGL, which this browser isn't providing." |
| Tile error 401/403 | Banner: "MapTiler rejected the key." |
| Tile error 429 | Banner: "MapTiler's monthly quota is used up." |
| Other tile errors | Ignored, since they're usually transient. MapLibre retries on the next view. |
| Terrain not loaded yet | `groundAt` returns `null`, and the camera uses recorded elevation until tiles arrive. |

The status codes are read from `e.error.status` in the map's `error` event. The
first task with a real key confirms that field, triggering the 403 case with a
deliberately bad key.

## Testing

Unit tests run in Vitest with happy-dom. None of them touch WebGL or the network.

### `geo.test.ts`

- `bearingDeg`: due north is 0, due east is 90, due south is 180, due west is 270.
- `destinationPoint` followed by `haversineMeters` recovers the distance to within 0.1 %.
- `mercatorX`/`mercatorY` match geojson-vt's formulas at several points, including the clamp near the poles.
- `metersPerMercatorUnit(0)` equals `EARTH_CIRCUMFERENCE_M`, and at 60° it is half that.
- The existing `gpxParser` tests pass unchanged, which shows the move didn't alter any distance.

### `flyoverRoute.test.ts`

- It returns `null` for no GPS, a single point, and all-identical points.
- Consecutive duplicate positions collapse, and `m` is strictly increasing.
- **The animation axis is Mercator, not metres:** two segments of equal ground length at different latitudes get different shares of progress.
- It uses recorded `distance` when every point has one, and haversine for all points when any point lacks it.
- `positionAt` at 0, ½ and 1 gives the start, the interpolated midpoint and the end, and out-of-range progress is clamped.
- Optional fields: interpolated when present at both ends, the nearer value when present at one, `undefined` when present at neither.
- `timed` is true only when every point has a timestamp.

### `flyoverCamera.test.ts`

- On a straight northbound route, the camera is due south of the rider and `heading` ≈ 0.
- After a 90° turn, the camera ends up behind the new direction.
- Scrubbing forwards to a point and backwards to the same point gives identical poses.
- A 30 m sideways jitter point at the rider's position changes the heading by less than 0.5°.
- With a synthetic ridge behind the rider, `fromAltitude` is at least ridge + 30 m.
- With `groundAt` returning `null`, the recorded elevation is used.
- The default geometry on flat ground gives `pitchDeg ≤ 75`.

### `flyoverPlayback.test.ts`

- 1× at 60 000 ms total gives 1/60 progress per second.
- 2× doubles that.
- Progress clamps at 1.
- A 5 s `dt` advances only `MAX_FRAME_MS` worth.

### `flyoverStyle.test.ts` and `tabAvailability.test.ts`

- The style has both sources with the key in their URLs, and the key is URL-encoded.
- `routeGradient` clamps `p`, and has the traveled colour below it and the ahead colour above.
- With a stubbed key and a GPS track, the tab is enabled.
- With no key, it's disabled with the config reason.
- A no-GPS file gets the GPS reason even without a key.
- `defaultTab` never returns `'flyover'`.

### Manual verification

These need a real MapTiler key (in `.env.local` as `VITE_MAPTILER_KEY`) and
real iGPSport exports:

1. The tileset names and `tileSize` values from `buildStyle` load sharp satellite imagery on visible terrain.
2. A hilly ride (the largest file, 2026-08-15, 122 km) plays through without the camera entering terrain on descents.
3. The bright/faint boundary stays under the rider marker for the whole ride.
4. Pausing, dragging to look around, then resuming snaps back to the chase view.
5. Switching tabs away and back 20 times produces no "Too many active WebGL contexts" warning in the console.
6. An untimed GPX plays, with the elapsed-time field hidden.
7. A deliberately bad key shows the 403 banner.
8. `npm run build` puts `maplibre-gl` in its own chunk. The main chunk grows by less than 5 KB gzipped over a baseline build of the commit before this work, which the first task records.

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
