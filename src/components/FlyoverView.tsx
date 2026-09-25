import { useEffect, useMemo, useRef, useState } from 'react';
import { LngLat, MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre looks for its worker beside its own module, which a bundler moves: the
// dev server pre-bundles it into .vite/deps, and a build inlines it into this chunk.
// Neither place has the worker file, so the map never loads. Give it a URL Vite
// does serve and emit, bundled together with the worker's shared-chunk import.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { FitRecord } from '../types/fit';
import { buildRoute, positionAt, type Route } from '../utils/flyoverRoute';
import { chaseCamera, MAX_PITCH } from '../utils/flyoverCamera';
import { advance, playFrom, type Speed } from '../utils/flyoverPlayback';
import { mapTilerKey } from '../utils/flyoverConfig';
import { buildStyle, routeGradient, TRAVELED_COLOR } from '../utils/flyoverStyle';
import { flyoverStats } from '../utils/flyoverStats';
import { FLYOVER_NO_KEY, FLYOVER_NO_ROUTE } from '../utils/tabAvailability';
import FlyoverControls, { FlyoverStatsPanel } from './FlyoverControls';

setWorkerUrl(maplibreWorkerUrl);

interface Props {
  records: FitRecord[];
}

/** How often the scrubber and readouts re-render during playback. */
const UI_INTERVAL_MS = 100;

type Banner = 'key' | 'quota';

const BANNERS: Record<Banner, string> = {
  key: 'MapTiler rejected the key.',
  quota: "MapTiler's monthly quota is used up.",
};

const NO_WEBGL = "The 3D view needs WebGL, which this browser isn't providing.";

const CARD = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl';

let webglSupport: boolean | undefined;

/**
 * Whether this browser can give MapLibre a WebGL context. Probed once per page
 * load, and the probe's context released at once: browsers cap live WebGL
 * contexts, and a fresh probe on every tab switch would count against the cap.
 */
function supportsWebGL(): boolean {
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      webglSupport = gl !== null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

/** Gestures fight the chase camera, so they are off while playing. */
function setGestures(map: MapLibreMap, enabled: boolean) {
  const handlers = [
    map.dragPan,
    map.dragRotate,
    map.scrollZoom,
    map.touchZoomRotate,
    map.doubleClickZoom,
    map.keyboard,
  ];
  for (const handler of handlers) {
    if (enabled) handler.enable();
    else handler.disable();
  }
}

/** Moves the camera, the traveled line and the rider marker to `progress`. */
function drawFrame(map: MapLibreMap, route: Route, progress: number) {
  const pose = chaseCamera(route, progress, p => map.queryTerrainElevation(p));
  map.jumpTo(
    map.calculateCameraOptionsFromTo(
      new LngLat(pose.from.lng, pose.from.lat),
      pose.fromAltitude,
      new LngLat(pose.to.lng, pose.to.lat),
      pose.toAltitude,
    ),
  );
  map.setPaintProperty('route', 'line-gradient', routeGradient(progress));
  (map.getSource('rider') as GeoJSONSource | undefined)?.setData({
    type: 'Point',
    coordinates: [pose.to.lng, pose.to.lat],
  });
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
  const readyRef = useRef(false);
  // The live values; the state copies below drive rendering at UI_INTERVAL_MS.
  const progressRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef<Speed>(1);

  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!route || !key || !webgl || !container) return;

    // If this throws anyway, FlyoverTab's error boundary catches it.
    const map = new MapLibreMap({ container, style: buildStyle(key), maxPitch: MAX_PITCH });
    mapRef.current = map;

    map.on('error', e => {
      const status = (e.error as { status?: unknown } | undefined)?.status;
      if (status === 401 || status === 403) setBanner('key');
      else if (status === 429) setBanner('quota');
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
      map.addSource('rider', {
        type: 'geojson',
        data: { type: 'Point', coordinates: [route.points[0].lng, route.points[0].lat] },
      });
      map.addLayer({
        id: 'rider',
        type: 'circle',
        source: 'rider',
        paint: {
          'circle-radius': 7,
          'circle-color': TRAVELED_COLOR,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      readyRef.current = true;
      drawFrame(map, route, progressRef.current);
      // Terrain heights are unknown until its tiles arrive; redraw a paused view once they have.
      map.once('idle', () => {
        if (!playingRef.current) drawFrame(map, route, progressRef.current);
      });
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
        drawFrame(map, route, next);
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
      map.remove();
    };
  }, [route, key, webgl]);

  const stats = useMemo(
    () => (route ? flyoverStats(positionAt(route, progress), route) : []),
    [route, progress],
  );

  const redraw = (p: number) => {
    const map = mapRef.current;
    if (map && route && readyRef.current) drawFrame(map, route, p);
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
