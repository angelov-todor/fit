import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLat, MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre looks for its worker beside its own module, which a bundler moves: the
// dev server pre-bundles it into .vite/deps, and a build inlines it into this chunk.
// Neither place has the worker file, so the map never loads. Give it a URL Vite
// does serve and emit, bundled together with the worker's shared-chunk import.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FitRecord } from '../types/fit';
import { buildRoute, positionAt, type Route } from '../utils/flyoverRoute';
import { CAMERA_GESTURES, chaseCamera, groundFromTerrain, MAX_PITCH, poseMoved, type CameraPose } from '../utils/flyoverCamera';
import { advance, playFrom, type Speed } from '../utils/flyoverPlayback';
import { mapTilerErrorKind, mapTilerKey, type MapTilerErrorKind } from '../utils/flyoverConfig';
import { buildStyle, routeGradient, TRAVELED_COLOR } from '../utils/flyoverStyle';
import { flyoverStats } from '../utils/flyoverStats';
import { canRenderMap } from '../utils/webgl';
import { FLYOVER_NO_KEY, FLYOVER_NO_ROUTE } from '../utils/tabAvailability';
import FlyoverControls, { FlyoverStatsPanel } from './FlyoverControls';

setWorkerUrl(maplibreWorkerUrl);

interface Props {
  records: FitRecord[];
}

/** How often the scrubber and readouts re-render during playback. */
const UI_INTERVAL_MS = 100;

const BANNERS: Record<MapTilerErrorKind, string> = {
  key: 'MapTiler rejected the key.',
  quota: "MapTiler's monthly quota is used up.",
};

const NO_WEBGL = "The 3D view needs WebGL, which this browser isn't providing.";

const CARD = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl';

let webglSupport: boolean | undefined;

/** Probed once per page load, not on every tab switch. */
function supportsWebGL(): boolean {
  webglSupport ??= canRenderMap();
  return webglSupport;
}

/** Gestures fight the chase camera, so they are off while playing. */
function setGestures(map: MapLibreMap, enabled: boolean) {
  for (const name of CAMERA_GESTURES) {
    if (enabled) map[name].enable();
    else map[name].disable();
  }
}

/**
 * The rider: a DOM marker rather than a GeoJSON circle. GeoJSONSource.setData is
 * asynchronous (the worker re-tiles it), so a circle trails the camera by a few
 * frames, tens of metres on a long ride at speed, and drifts off the point where
 * the route changes colour. A marker moves in the same frame as the camera.
 */
function riderDot(): HTMLDivElement {
  const dot = document.createElement('div');
  dot.className = 'w-4 h-4 rounded-full border-2 border-white shadow-md';
  dot.style.backgroundColor = TRAVELED_COLOR;
  return dot;
}

/** Where the camera belongs at `progress`, given the terrain loaded so far. */
function poseAt(map: MapLibreMap, route: Route, progress: number): CameraPose {
  return chaseCamera(route, progress, groundFromTerrain(p => map.queryTerrainElevation(p)));
}

/** Moves the camera, the traveled line and the rider marker to `pose` at `progress`. */
function applyFrame(map: MapLibreMap, rider: Marker, pose: CameraPose, progress: number) {
  map.jumpTo(
    map.calculateCameraOptionsFromTo(
      new LngLat(pose.from.lng, pose.from.lat),
      pose.fromAltitude,
      new LngLat(pose.to.lng, pose.to.lat),
      pose.toAltitude,
    ),
  );
  map.setPaintProperty('route', 'line-gradient', routeGradient(progress));
  rider.setLngLat([pose.to.lng, pose.to.lat]);
}

/**
 * The flyover. `records` is fixed for the life of the view: loading a new file
 * switches to defaultTab, which is never 'flyover', so the view unmounts first.
 */
export default function FlyoverView({ records }: Props) {
  const route = useMemo(() => buildRoute(records), [records]);
  const [webgl] = useState(supportsWebGL);
  const key = mapTilerKey();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Draws the frame at a progress; set by the effect that owns the map.
  const drawRef = useRef<((progress: number) => void) | null>(null);
  const readyRef = useRef(false);
  // The live values; the state copies below drive rendering at UI_INTERVAL_MS.
  const progressRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef<Speed>(1);

  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [banner, setBanner] = useState<MapTilerErrorKind | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!route || !key || !webgl || !container) return;

    // If this throws anyway, FlyoverTab's error boundary catches it.
    // Open at the start of the route, not on the world view MapLibre defaults to.
    const start: [number, number] = [route.points[0].lng, route.points[0].lat];
    const map = new MapLibreMap({ container, style: buildStyle(key), maxPitch: MAX_PITCH, center: start, zoom: 14 });
    mapRef.current = map;
    const rider = new Marker({ element: riderDot() }).setLngLat(start).addTo(map);

    let lastPose: CameraPose | null = null;
    // Set when the user drags or zooms while paused, so terrain redraws don't yank the view back.
    let userMoved = false;
    const draw = (p: number) => {
      lastPose = poseAt(map, route, p);
      applyFrame(map, rider, lastPose, p);
      userMoved = false;
    };
    drawRef.current = draw;

    map.on('error', e => {
      // A listener switches off MapLibre's own logging, so log here, and explain
      // the failures a user can do something about.
      console.error(e.error);
      const kind = mapTilerErrorKind(e.error);
      if (kind) setBanner(kind);
    });
    map.on('movestart', e => {
      if (e.originalEvent) userMoved = true; // jumpTo's own movestart has no originalEvent
    });

    map.on('load', () => {
      map.setTerrain({ source: 'terrain', exaggeration: 1 });
      map.setSky({ 'sky-color': '#7fb4e8', 'horizon-color': '#e6f0fa', 'sky-horizon-blend': 0.6 });
      map.addSource('route', {
        type: 'geojson',
        lineMetrics: true, // line-gradient needs it
        // route.points, never the raw records: they are the positions the progress axis was measured on.
        data: { type: 'LineString', coordinates: route.points.map(p => [p.lng, p.lat]) },
      });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-width': 5, 'line-gradient': routeGradient(progressRef.current) },
      });
      readyRef.current = true;
      draw(progressRef.current);
    });

    // Terrain heights are unknown until its tiles arrive, which can be after any
    // scrub. Once tiles settle, redraw a paused view if they moved the camera;
    // poseMoved stops this once the pose settles.
    map.on('idle', () => {
      if (!readyRef.current || playingRef.current || userMoved || !lastPose) return;
      if (poseMoved(lastPose, poseAt(map, route, progressRef.current))) draw(progressRef.current);
    });

    let frame = 0;
    let last = performance.now();
    let lastUi = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (readyRef.current && playingRef.current) {
        const next = advance(progressRef.current, dt, speedRef.current);
        progressRef.current = next;
        draw(next);
        const finished = next >= 1;
        if (finished) {
          playingRef.current = false;
          setPlaying(false);
          setGestures(map, true);
        }
        if (finished || now - lastUi >= UI_INTERVAL_MS) {
          lastUi = now;
          setProgress(next);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      readyRef.current = false;
      mapRef.current = null;
      drawRef.current = null;
      rider.remove();
      map.remove();
    };
  }, [route, key, webgl]);

  const stats = useMemo(
    () => (route ? flyoverStats(positionAt(route, progress), route) : []),
    [route, progress],
  );

  const redraw = (p: number) => {
    if (readyRef.current) drawRef.current?.(p);
  };

  const togglePlay = () => {
    const map = mapRef.current;
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      if (map) setGestures(map, true);
      return;
    }
    const start = playFrom(progressRef.current);
    progressRef.current = start;
    setProgress(start);
    playingRef.current = true;
    setPlaying(true);
    if (map) setGestures(map, false);
    redraw(start); // snap back to the chase view now, not on the next frame
  };

  const restart = () => {
    progressRef.current = 0;
    setProgress(0);
    redraw(0);
  };

  const scrub = (p: number) => {
    progressRef.current = p;
    setProgress(p);
    redraw(p);
  };

  const changeSpeed = (s: Speed) => {
    speedRef.current = s;
    setSpeed(s);
  };

  const message = (text: string) => (
    <div className={`${CARD} p-12 text-center text-sm text-slate-400`}>{text}</div>
  );
  if (!route) return message(FLYOVER_NO_ROUTE);
  if (!key) return message(FLYOVER_NO_KEY);
  if (!webgl) return message(NO_WEBGL);

  return (
    <div className={`${CARD} overflow-hidden`}>
      {banner && (
        <div
          role="alert"
          className="px-3 py-2 text-xs bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-b border-amber-200 dark:border-amber-800"
        >
          {BANNERS[banner]}
        </div>
      )}
      <div className="relative" style={{ height: '520px' }}>
        {/* Sized by its parent, not by `absolute inset-0`: maplibre-gl.css sets
            .maplibregl-map { position: relative }, which overrides Tailwind and would
            collapse an absolutely-positioned container to zero height. */}
        <div ref={containerRef} className="h-full w-full" />
        <FlyoverStatsPanel stats={stats} />
      </div>
      <FlyoverControls
        playing={playing}
        progress={progress}
        speed={speed}
        onTogglePlay={togglePlay}
        onRestart={restart}
        onScrub={scrub}
        onSpeed={changeSpeed}
      />
    </div>
  );
}
