import { useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet';
import type { FitRecord } from '../types/fit';

interface Props {
  records: FitRecord[];
}

export default function MapView({ records }: Props) {
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
  const center: [number, number] = [
    trackPoints.reduce((sum, p) => sum + p.lat, 0) / trackPoints.length,
    trackPoints.reduce((sum, p) => sum + p.lng, 0) / trackPoints.length,
  ];

  const start = trackPoints[0];
  const end = trackPoints[trackPoints.length - 1];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-3 border-b border-slate-100 flex items-center gap-4 text-xs text-slate-500">
        <span>Track points: <strong className="text-slate-700">{trackPoints.length.toLocaleString()}</strong></span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Start
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> End
        </span>
      </div>
      <div style={{ height: '450px' }}>
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
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
  );
}
