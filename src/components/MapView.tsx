import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { FitRecord } from '../types/fit';

interface Props {
  records: FitRecord[];
}

function FitBoundsAndResize({ bounds, expanded }: { bounds: LatLngBoundsExpression; expanded: boolean }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [30, 30] });
    }, 150);
    return () => clearTimeout(timer);
  }, [map, bounds, expanded]);
  return null;
}

export default function MapView({ records }: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [expanded]);

  const trackPoints = useMemo(() =>
    records
      .filter(r => r.position_lat != null && r.position_long != null)
      .map(r => ({
        lat: r.position_lat as number,
        lng: r.position_long as number,
        alt: (r.enhanced_altitude ?? r.altitude) as number | undefined,
        hr: r.heart_rate as number | undefined,
        speed: r.speed as number | undefined,
        time: r.timestamp,
      })),
    [records]
  );

  if (trackPoints.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <div className="text-slate-400 text-sm">No GPS data available in this file</div>
      </div>
    );
  }

  const latlngs: [number, number][] = trackPoints.map(p => [p.lat, p.lng]);

  const start = trackPoints[0];
  const end = trackPoints[trackPoints.length - 1];

  return (
    <>
      {expanded && <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setExpanded(false)} role="presentation" />}
      <div
        className={
          expanded
            ? 'fixed inset-4 top-16 z-50 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xl flex flex-col'
            : 'bg-white border border-slate-200 rounded-xl overflow-hidden'
        }
        {...(expanded ? { role: 'dialog', 'aria-label': 'Expanded map' } : {})}
      >
        <div className="p-3 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span>Track points: <strong className="text-slate-700">{trackPoints.length.toLocaleString()}</strong></span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Start
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> End
            </span>
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title={expanded ? 'Collapse map' : 'Expand map'}
          >
            {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
        <div className={expanded ? 'flex-1' : ''} style={expanded ? undefined : { height: '450px' }}>
          <MapContainer bounds={latlngs as LatLngBoundsExpression} boundsOptions={{ padding: [30, 30] }} style={{ height: '100%', width: '100%' }}>
            <FitBoundsAndResize bounds={latlngs as LatLngBoundsExpression} expanded={expanded} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Polyline positions={latlngs} color="#3b82f6" weight={3} opacity={0.8} />
            <CircleMarker
              center={[start.lat, start.lng]}
              radius={8}
              pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1, weight: 2 }}
            >
              <Popup>
                <strong>Start</strong>
                {start.time instanceof Date && <div>{start.time.toLocaleString()}</div>}
                {start.alt != null && <div>Elevation: {start.alt.toFixed(1)}m</div>}
              </Popup>
            </CircleMarker>
            <CircleMarker
              center={[end.lat, end.lng]}
              radius={8}
              pathOptions={{ color: '#dc2626', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}
            >
              <Popup>
                <strong>End</strong>
                {end.time instanceof Date && <div>{end.time.toLocaleString()}</div>}
                {end.alt != null && <div>Elevation: {end.alt.toFixed(1)}m</div>}
              </Popup>
            </CircleMarker>
          </MapContainer>
        </div>
      </div>
    </>
  );
}
