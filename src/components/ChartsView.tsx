import { useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { FitRecord, FitLap } from '../types/fit';
import { formatDuration } from '../utils/fitParser';

interface Props {
  records: FitRecord[];
  laps: FitLap[];
}

interface MetricDef {
  key: string;
  label: string;
  unit: string;
  color: string;
  altKey?: string;
  transform?: (v: number) => number;
}

const METRICS: MetricDef[] = [
  { key: 'heart_rate',   label: 'Heart Rate',   unit: 'bpm',  color: '#ef4444' },
  { key: 'speed',        label: 'Speed',        unit: 'km/h', color: '#3b82f6', transform: (v: number) => +(v * 3.6).toFixed(2) },
  { key: 'power',        label: 'Power',        unit: 'W',    color: '#f59e0b' },
  { key: 'cadence',      label: 'Cadence',      unit: 'rpm',  color: '#8b5cf6' },
  { key: 'altitude',     label: 'Elevation',    unit: 'm',    color: '#10b981', altKey: 'enhanced_altitude' },
  { key: 'temperature',  label: 'Temperature',  unit: '°C',   color: '#06b6d4' },
  { key: 'distance',     label: 'Distance',     unit: 'm',    color: '#64748b' },
];

type XAxisMode = 'time' | 'distance' | 'elapsed';

interface ChartPoint {
  index: number;
  ms: number;       // raw epoch ms — used for lap filtering
  time: string;
  distance: number;
  elapsed: number;
  [key: string]: number | string;
}

interface TooltipPayload {
  color: string;
  name: string;
  value: number;
}

function CustomTooltip({
  active, payload, label, xMode,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  xMode: XAxisMode;
}) {
  if (!active || !payload?.length) return null;

  const labelStr = xMode === 'distance'
    ? `${(Number(label) / 1000).toFixed(2)} km`
    : xMode === 'elapsed'
    ? formatDuration(Number(label))
    : label ?? '';

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[120px]">
      <p className="font-semibold text-slate-500 mb-1.5">{labelStr}</p>
      {payload.map(p => {
        const metric = METRICS.find(m => m.key === p.name || m.label === p.name);
        return (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1 text-slate-500">
              <span style={{ color: p.color }}>●</span>
              {metric?.label ?? p.name}
            </span>
            <span className="font-bold text-slate-800">
              {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
              {metric ? ` ${metric.unit}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LapLines({ boundaries }: { boundaries: { x: string | number; label: string }[] }) {
  return (
    <>
      {boundaries.map((lap, i) => (
        <ReferenceLine
          key={i}
          x={lap.x}
          stroke="#94a3b8"
          strokeDasharray="4 3"
          strokeWidth={1}
          label={{ value: lap.label, position: 'insideTopRight', fontSize: 9, fill: '#94a3b8', dy: -2 }}
        />
      ))}
    </>
  );
}

function useChartAxisProps(data: ChartPoint[], xMode: XAxisMode) {
  const xKey = xMode === 'distance' ? 'distance' : xMode === 'elapsed' ? 'elapsed' : 'time';
  const xFormatter = (val: string | number) => {
    if (xMode === 'distance') return `${(Number(val) / 1000).toFixed(1)}km`;
    if (xMode === 'elapsed') return formatDuration(Number(val));
    return String(val);
  };
  const tickInterval = Math.max(1, Math.ceil(data.length / 6) - 1);

  const commonAxisProps = {
    dataKey: xKey,
    tick: { fontSize: 9, fill: '#94a3b8' },
    tickFormatter: xFormatter,
    interval: tickInterval,
    tickLine: false,
    axisLine: false,
  } as const;

  const commonYProps = {
    tick: { fontSize: 9, fill: '#94a3b8' },
    tickLine: false,
    axisLine: false,
    width: 36,
  } as const;

  return { xKey, commonAxisProps, commonYProps };
}

function SingleChart({
  data, metric, xMode, showLaps, lapBoundaries,
}: {
  data: ChartPoint[];
  metric: MetricDef;
  xMode: XAxisMode;
  showLaps: boolean;
  lapBoundaries: { x: string | number; label: string }[];
}) {
  const { commonAxisProps, commonYProps } = useChartAxisProps(data, xMode);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: metric.color }} />
        <span className="text-xs font-semibold text-slate-700">{metric.label}</span>
        <span className="text-xs text-slate-400">({metric.unit})</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis {...commonAxisProps} />
          <YAxis {...commonYProps} />
          <Tooltip content={<CustomTooltip xMode={xMode} />} />
          {showLaps && <LapLines boundaries={lapBoundaries} />}
          <Line type="monotone" dataKey={metric.key} stroke={metric.color}
            strokeWidth={1.5} dot={false} name={metric.key} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function OverlayChart({
  data, metrics, xMode, showLaps, lapBoundaries,
}: {
  data: ChartPoint[];
  metrics: MetricDef[];
  xMode: XAxisMode;
  showLaps: boolean;
  lapBoundaries: { x: string | number; label: string }[];
}) {
  const { commonAxisProps, commonYProps } = useChartAxisProps(data, xMode);
  const hasRight = metrics.length >= 2;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {metrics.map((m, i) => (
          <span key={m.key} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: m.color }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            {m.label}
            <span className="font-normal opacity-70">
              ({m.unit}){i === 0 ? ' ←' : i === 1 ? ' →' : ''}
            </span>
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: hasRight ? 44 : 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis {...commonAxisProps} />
          {/* First metric → left Y-axis */}
          <YAxis yAxisId="left" {...commonYProps}
            tick={{ ...commonYProps.tick, fill: metrics[0].color }} />
          {/* Second metric → right Y-axis */}
          {hasRight && (
            <YAxis yAxisId="right" orientation="right" {...commonYProps} width={40}
              tick={{ ...commonYProps.tick, fill: metrics[1].color }} />
          )}
          <Tooltip content={<CustomTooltip xMode={xMode} />} />
          {showLaps && <LapLines boundaries={lapBoundaries} />}
          {metrics.map((m, i) => (
            <Line key={m.key}
              yAxisId={i === 0 ? 'left' : i === 1 ? 'right' : 'left'}
              type="monotone" dataKey={m.key} stroke={m.color}
              strokeWidth={1.5} dot={false} name={m.key} connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ChartsView({ records, laps }: Props) {
  const [overlayMetrics, setOverlayMetrics] = useState<Set<string>>(new Set());
  const [xMode, setXMode]             = useState<XAxisMode>('time');
  const [showLaps, setShowLaps]       = useState(true);
  const [filterLap, setFilterLap]     = useState<number | 'all'>('all');

  const toggleOverlay = useCallback((key: string) => {
    setOverlayMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const availableMetrics = useMemo(() =>
    METRICS.filter(m =>
      records.some(r => {
        const rec = r as Record<string, unknown>;
        return rec[m.key] != null || (m.altKey && rec[m.altKey] != null);
      })
    ),
    [records]
  );

  // Build chart data points
  const allChartData = useMemo<ChartPoint[]>(() => {
    const firstTs = records[0]?.timestamp instanceof Date ? records[0].timestamp.getTime() : 0;
    return records
      .filter(r => r.timestamp instanceof Date)
      .map((r, i) => {
        const ms = (r.timestamp as Date).getTime();
        const point: ChartPoint = {
          index: i,
          ms,
          time: (r.timestamp as Date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          distance: typeof r.distance === 'number' ? r.distance : 0,
          elapsed: Math.round((ms - firstTs) / 1000),
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
  }, [records]);

  // Lap boundaries
  const lapBoundaries = useMemo(() => {
    if (!showLaps || laps.length < 2 || allChartData.length === 0) return [];

    const findNearest = (targetMs: number) => {
      let best = allChartData[0];
      let bestDiff = Infinity;
      for (const p of allChartData) {
        const diff = Math.abs(p.ms - targetMs);
        if (diff < bestDiff) { bestDiff = diff; best = p; }
      }
      return best;
    };

    return laps.slice(1).map((lap, i) => {
      const boundaryMs = lap.start_time instanceof Date ? lap.start_time.getTime() : null;
      if (boundaryMs == null) return null;

      const point = findNearest(boundaryMs);
      const x = xMode === 'distance' ? point.distance
        : xMode === 'elapsed' ? point.elapsed
        : point.time;

      return { x, label: `L${i + 2}` };
    }).filter((b): b is { x: string | number; label: string } => b !== null);
  }, [laps, xMode, showLaps, allChartData]);

  // Filter by lap
  const chartData = useMemo(() => {
    if (filterLap === 'all') return allChartData;
    const lap = laps[filterLap];
    if (!lap) return allChartData;

    const startMs = lap.start_time instanceof Date
      ? lap.start_time.getTime()
      : null;

    const nextLap = laps[filterLap + 1];
    const endMs = nextLap?.start_time instanceof Date
      ? nextLap.start_time.getTime()
      : lap.timestamp instanceof Date
      ? lap.timestamp.getTime()
      : null;

    if (startMs == null) return allChartData;

    return allChartData.filter(p =>
      p.ms >= startMs && (endMs == null || p.ms <= endMs)
    );
  }, [allChartData, filterLap, laps]);

  const handleFilterLap = (v: number | 'all') => setFilterLap(v);

  const overlayList = availableMetrics.filter(m => overlayMetrics.has(m.key));
  const individualMetrics = availableMetrics.filter(m => !overlayMetrics.has(m.key));
  const showLapLines = showLaps && filterLap === 'all';

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-4">
        {/* X-axis mode */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">X axis:</span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {(['time', 'elapsed', 'distance'] as XAxisMode[]).map(m => (
              <button
                key={m}
                onClick={() => setXMode(m)}
                className={`px-2.5 py-1.5 font-medium transition-colors capitalize ${
                  xMode === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        {/* Lap filter */}
        {laps.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Lap:</span>
            <select
              value={filterLap}
              onChange={e => handleFilterLap(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All laps</option>
              {laps.map((lap, i) => {
                const dur = typeof lap.total_elapsed_time === 'number'
                  ? formatDuration(lap.total_elapsed_time)
                  : '';
                const dist = typeof lap.total_distance === 'number'
                  ? lap.total_distance >= 1000
                    ? `${(lap.total_distance / 1000).toFixed(2)} km`
                    : `${lap.total_distance.toFixed(0)} m`
                  : '';
                return (
                  <option key={i} value={i}>
                    Lap {i + 1}{dur ? ` · ${dur}` : ''}{dist ? ` · ${dist}` : ''}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Show laps toggle */}
        {laps.length > 1 && filterLap === 'all' && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showLaps}
              onChange={e => setShowLaps(e.target.checked)}
              className="rounded"
            />
            Lap lines
          </label>
        )}

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        {/* Overlay checkboxes */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500 font-medium">Overlay:</span>
          {availableMetrics.map(m => (
            <label key={m.key} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overlayMetrics.has(m.key)}
                onChange={() => toggleOverlay(m.key)}
                className="rounded"
              />
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      {/* Lap summary pills (when all laps shown) */}
      {filterLap === 'all' && laps.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {laps.map((lap, i) => {
            const dur = typeof lap.total_elapsed_time === 'number' ? formatDuration(lap.total_elapsed_time) : '';
            const hr = typeof lap.avg_heart_rate === 'number' ? `${lap.avg_heart_rate} bpm` : '';
            const dist = typeof lap.total_distance === 'number'
              ? lap.total_distance >= 1000 ? `${(lap.total_distance / 1000).toFixed(2)} km` : `${lap.total_distance.toFixed(0)} m`
              : '';
            return (
              <button
                key={i}
                onClick={() => handleFilterLap(i)}
                className="px-2.5 py-1 text-xs rounded-full bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition-colors text-slate-600 flex items-center gap-1.5"
              >
                <span className="font-semibold">L{i + 1}</span>
                {dist && <span>{dist}</span>}
                {dur && <span className="text-slate-400">{dur}</span>}
                {hr && <span className="text-red-400">{hr}</span>}
              </button>
            );
          })}
        </div>
      )}

      {filterLap !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-600 font-medium">
            Viewing Lap {Number(filterLap) + 1}
          </span>
          <button
            onClick={() => handleFilterLap('all')}
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Show all
          </button>
        </div>
      )}

      {/* Overlay chart (when 2+ metrics selected) */}
      {overlayList.length >= 2 && (
        <OverlayChart
          data={chartData}
          metrics={overlayList}
          xMode={xMode}
          showLaps={showLapLines}
          lapBoundaries={lapBoundaries}
        />
      )}

      {/* Individual charts for all non-overlaid metrics */}
      {individualMetrics.map(m => (
        <SingleChart
          key={m.key}
          data={chartData}
          metric={m}
          xMode={xMode}
          showLaps={showLapLines}
          lapBoundaries={lapBoundaries}
        />
      ))}

      {/* If only 1 overlay metric checked, still show it individually */}
      {overlayList.length === 1 && (
        <SingleChart
          data={chartData}
          metric={overlayList[0]}
          xMode={xMode}
          showLaps={showLapLines}
          lapBoundaries={lapBoundaries}
        />
      )}

      {records.length === 0 && (
        <div className="text-center text-slate-400 py-12">No record data available for charts</div>
      )}
    </div>
  );
}
