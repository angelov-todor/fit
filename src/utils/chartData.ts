import type { FitRecord } from '../types/fit';
import { MS_TO_KMH } from './fitParser';

export type XAxisMode = 'time' | 'distance' | 'elapsed';

export interface MetricDef {
  key: string;
  label: string;
  unit: string;
  color: string;
  altKey?: string;
  transform?: (v: number) => number;
}

export interface ChartPoint {
  index: number;
  ms: number;
  time: string;
  distance: number;
  elapsed: number;
  [key: string]: number | string;
}

export const METRICS: MetricDef[] = [
  { key: 'heart_rate',   label: 'Heart Rate',   unit: 'bpm',  color: '#ef4444' },
  { key: 'speed',        label: 'Speed',        unit: 'km/h', color: '#3b82f6', altKey: 'enhanced_speed', transform: (v: number) => +(v * MS_TO_KMH).toFixed(2) },
  { key: 'power',        label: 'Power',        unit: 'W',    color: '#f59e0b' },
  { key: 'cadence',      label: 'Cadence',      unit: 'rpm',  color: '#8b5cf6' },
  { key: 'altitude',     label: 'Elevation',    unit: 'm',    color: '#10b981', altKey: 'enhanced_altitude' },
  { key: 'temperature',  label: 'Temperature',  unit: '°C',   color: '#06b6d4' },
  { key: 'distance',     label: 'Distance',     unit: 'm',    color: '#64748b' },
];

function hasTimestamps(records: FitRecord[]): boolean {
  return records.some(r => r.timestamp instanceof Date);
}

/**
 * One chart point per record. GPX routes carry elevation without a clock, so
 * records without a timestamp are kept and simply have no time to plot against.
 */
export function buildChartPoints(records: FitRecord[]): ChartPoint[] {
  const firstTs = records.find(r => r.timestamp instanceof Date)?.timestamp?.getTime() ?? 0;

  return records.map((r, i) => {
    const ts = r.timestamp instanceof Date ? r.timestamp : undefined;
    const ms = ts ? ts.getTime() : 0;

    const point: ChartPoint = {
      index: i,
      ms,
      time: ts ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '',
      distance: typeof r.distance === 'number' ? r.distance : 0,
      elapsed: ts ? Math.round((ms - firstTs) / 1000) : 0,
    };

    const rec = r as Record<string, unknown>;
    for (const m of METRICS) {
      const raw = (m.altKey ? (rec[m.altKey] ?? rec[m.key]) : rec[m.key]) as number | undefined;
      if (raw != null) {
        point[m.key] = m.transform ? m.transform(raw) : raw;
      }
    }
    return point;
  });
}

/** Time-based X axes need a clock, which a planned route does not have. */
export function availableXAxisModes(records: FitRecord[]): XAxisMode[] {
  return hasTimestamps(records) ? ['time', 'elapsed', 'distance'] : ['distance'];
}

export function defaultXAxisMode(records: FitRecord[]): XAxisMode {
  return availableXAxisModes(records)[0];
}
