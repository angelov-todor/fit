import { useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Layers, X } from 'lucide-react';
import type { FitRecord, FitLap } from '../types/fit';
import { formatDuration, MS_TO_KMH } from '../utils/fitParser';

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
  { key: 'speed',        label: 'Speed',        unit: 'km/h', color: '#3b82f6', altKey: 'enhanced_speed', transform: (v: number) => +(v * MS_TO_KMH).toFixed(2) },
  { key: 'power',        label: 'Power',        unit: 'W',    color: '#f59e0b' },
  { key: 'cadence',      label: 'Cadence',      unit: 'rpm',  color: '#8b5cf6' },
  { key: 'altitude',     label: 'Elevation',    unit: 'm',    color: '#10b981', altKey: 'enhanced_altitude' },
  { key: 'temperature',  label: 'Temperature',  unit: '°C',   color: '#06b6d4' },
  { key: 'distance',     label: 'Distance',     unit: 'm',    color: '#64748b' },
];

type XAxisMode = 'time' | 'distance' | 'elapsed';

interface ChartPoint {
  index: number;
  ms: number;
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
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs min-w-[120px]">
      <p className="font-semibold text-slate-500 dark:text-slate-400 mb-1.5">{labelStr}</p>
      {payload.map(p => {
        const metric = METRICS.find(m => m.key === p.name || m.label === p.name);
        return (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <span style={{ color: p.color }}>●</span>
              {metric?.label ?? p.name}
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-100">
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

function useChartColors() {
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const grid = root?.getPropertyValue('--chart-grid').trim() || '#f1f5f9';
  const tick = root?.getPropertyValue('--chart-tick').trim() || '#94a3b8';
  return { grid, tick };
}

function useChartAxisProps(data: ChartPoint[], xMode: XAxisMode) {
  const { tick } = useChartColors();
  const xKey = xMode === 'distance' ? 'distance' : xMode === 'elapsed' ? 'elapsed' : 'time';
  const xFormatter = (val: string | number) => {
    if (xMode === 'distance') return `${(Number(val) / 1000).toFixed(1)}km`;
    if (xMode === 'elapsed') return formatDuration(Number(val));
    return String(val);
  };
  const tickInterval = Math.max(1, Math.ceil(data.length / 6) - 1);

  const commonAxisProps = {
    dataKey: xKey,
    tick: { fontSize: 9, fill: tick },
    tickFormatter: xFormatter,
    interval: tickInterval,
    tickLine: false,
    axisLine: false,
  } as const;

  const commonYProps = {
    tick: { fontSize: 9, fill: tick },
    tickLine: false,
    axisLine: false,
    width: 36,
  } as const;

  return { xKey, commonAxisProps, commonYProps };
}

// ── Single metric chart with pin toggle ─────────────────────────────────────

function SingleChart({
  data, metric, xMode, showLaps, lapBoundaries, isPinned, overlayFull, onTogglePin,
}: {
  data: ChartPoint[];
  metric: MetricDef;
  xMode: XAxisMode;
  showLaps: boolean;
  lapBoundaries: { x: string | number; label: string }[];
  isPinned: boolean;
  overlayFull: boolean;
  onTogglePin: () => void;
}) {
  const { commonAxisProps, commonYProps } = useChartAxisProps(data, xMode);
  const { grid } = useChartColors();
  const pinDisabled = !isPinned && overlayFull;

  return (
    <div className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 transition-opacity ${isPinned ? 'opacity-40' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: metric.color }} />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{metric.label}</span>
          <span className="text-xs text-slate-400">({metric.unit})</span>
        </div>
        <button
          onClick={onTogglePin}
          disabled={pinDisabled}
          title={isPinned ? 'Remove from overlay' : pinDisabled ? 'Overlay full (max 2)' : 'Add to overlay'}
          className={`p-1 rounded transition-colors ${
            isPinned
              ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50'
              : pinDisabled
              ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
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

// ── Overlay chart with unpin buttons ────────────────────────────────────────

function OverlayChart({
  data, metrics, xMode, showLaps, lapBoundaries, onUnpin,
}: {
  data: ChartPoint[];
  metrics: MetricDef[];
  xMode: XAxisMode;
  showLaps: boolean;
  lapBoundaries: { x: string | number; label: string }[];
  onUnpin: (key: string) => void;
}) {
  const { commonAxisProps, commonYProps } = useChartAxisProps(data, xMode);
  const { grid } = useChartColors();
  const hasRight = metrics.length >= 2;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {metrics.map((m, i) => (
          <span key={m.key} className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: m.color }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            {m.label}
            <span className="font-normal opacity-70">
              ({m.unit}){i === 0 ? ' \u2190' : i === 1 ? ' \u2192' : ''}
            </span>
            <button
              onClick={() => onUnpin(m.key)}
              title={`Remove ${m.label} from overlay`}
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors opacity-50 hover:opacity-100"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: hasRight ? 44 : 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis {...commonAxisProps} />
          <YAxis yAxisId="left" {...commonYProps}
            tick={{ ...commonYProps.tick, fill: metrics[0].color }} />
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

// ── Lap stats card ──────────────────────────────────────────────────────────

function LapStatsCard({ lap }: { lap: FitLap }) {
  const stats: { label: string; value: string }[] = [];

  if (typeof lap.total_elapsed_time === 'number')
    stats.push({ label: 'Duration', value: formatDuration(lap.total_elapsed_time) });
  if (typeof lap.total_distance === 'number')
    stats.push({ label: 'Distance', value: lap.total_distance >= 1000
      ? `${(lap.total_distance / 1000).toFixed(2)} km`
      : `${lap.total_distance.toFixed(0)} m` });
  if (typeof lap.avg_heart_rate === 'number')
    stats.push({ label: 'Avg HR', value: `${lap.avg_heart_rate} bpm` });
  if (typeof lap.max_heart_rate === 'number')
    stats.push({ label: 'Max HR', value: `${lap.max_heart_rate} bpm` });
  if (typeof lap.avg_speed === 'number')
    stats.push({ label: 'Avg Speed', value: `${(lap.avg_speed * MS_TO_KMH).toFixed(1)} km/h` });
  if (typeof lap.max_speed === 'number')
    stats.push({ label: 'Max Speed', value: `${(lap.max_speed * MS_TO_KMH).toFixed(1)} km/h` });
  if (typeof lap.avg_power === 'number')
    stats.push({ label: 'Avg Power', value: `${lap.avg_power} W` });
  if (typeof lap.max_power === 'number')
    stats.push({ label: 'Max Power', value: `${lap.max_power} W` });
  if (typeof lap.avg_cadence === 'number')
    stats.push({ label: 'Avg Cadence', value: `${lap.avg_cadence} rpm` });
  const ascent = (lap as Record<string, unknown>).total_ascent;
  if (typeof ascent === 'number')
    stats.push({ label: 'Elev Gain', value: `${ascent.toFixed(0)} m` });

  if (stats.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {stats.map(s => (
          <div key={s.label} className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{s.label}</span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ChartsView ─────────────────────────────────────────────────────────

export default function ChartsView({ records, laps }: Props) {
  const [overlayMetrics, setOverlayMetrics] = useState<Set<string>>(new Set());
  const [xMode, setXMode]             = useState<XAxisMode>('time');
  const [showLaps, setShowLaps]       = useState(true);
  const [selectedLap, setSelectedLap] = useState<number | null>(null);

  const MAX_OVERLAY = 2;

  const toggleOverlay = useCallback((key: string) => {
    setOverlayMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < MAX_OVERLAY) {
        next.add(key);
      }
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

  // Filter data to selected lap (zoom), or show all
  const chartData = useMemo(() => {
    if (selectedLap == null) return allChartData;
    const lap = laps[selectedLap];
    if (!lap) return allChartData;

    const startMs = lap.start_time instanceof Date ? lap.start_time.getTime() : null;
    if (startMs == null) return allChartData;

    const nextLap = laps[selectedLap + 1];
    const endMs = nextLap?.start_time instanceof Date
      ? nextLap.start_time.getTime()
      : lap.timestamp instanceof Date
      ? lap.timestamp.getTime()
      : null;

    return allChartData.filter(p =>
      p.ms >= startMs && (endMs == null || p.ms <= endMs)
    );
  }, [allChartData, selectedLap, laps]);

  // Lap boundaries (hidden when zoomed into a single lap)
  const lapBoundaries = useMemo(() => {
    if (!showLaps || selectedLap != null || laps.length < 2 || allChartData.length === 0) return [];

    const findNearest = (targetMs: number) => {
      let lo = 0, hi = allChartData.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((allChartData[mid].ms as number) < targetMs) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && Math.abs((allChartData[lo - 1].ms as number) - targetMs) < Math.abs((allChartData[lo].ms as number) - targetMs)) {
        return allChartData[lo - 1];
      }
      return allChartData[lo];
    };

    const xValForPoint = (point: ChartPoint) => {
      if (xMode === 'distance') return point.distance;
      if (xMode === 'elapsed') return point.elapsed;
      return point.time;
    };

    return laps.slice(1).map((lap, i) => {
      const boundaryMs = lap.start_time instanceof Date ? lap.start_time.getTime() : null;
      if (boundaryMs == null) return null;
      const point = findNearest(boundaryMs);
      return { x: xValForPoint(point), label: `L${i + 2}` };
    }).filter((b): b is { x: string | number; label: string } => b !== null);
  }, [laps, xMode, showLaps, selectedLap, allChartData]);

  const handleSelectLap = (i: number) => {
    setSelectedLap(prev => prev === i ? null : i);
  };

  const overlayList = availableMetrics.filter(m => overlayMetrics.has(m.key));
  const showLapLines = showLaps && selectedLap == null;

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap items-center gap-4">
        {/* X-axis mode */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">X axis:</span>
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden text-xs">
            {(['time', 'elapsed', 'distance'] as XAxisMode[]).map(m => (
              <button
                key={m}
                onClick={() => setXMode(m)}
                className={`px-2.5 py-1.5 font-medium transition-colors capitalize ${
                  xMode === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {laps.length > 1 && (
          <>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-600 hidden sm:block" />
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLaps}
                onChange={e => setShowLaps(e.target.checked)}
                className="rounded"
              />
              Lap lines
            </label>
          </>
        )}
      </div>

      {/* Lap summary pills */}
      {laps.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {laps.map((lap, i) => {
            const dur = typeof lap.total_elapsed_time === 'number' ? formatDuration(lap.total_elapsed_time) : '';
            const hr = typeof lap.avg_heart_rate === 'number' ? `${lap.avg_heart_rate} bpm` : '';
            const dist = typeof lap.total_distance === 'number'
              ? lap.total_distance >= 1000 ? `${(lap.total_distance / 1000).toFixed(2)} km` : `${lap.total_distance.toFixed(0)} m`
              : '';
            const isSelected = selectedLap === i;
            return (
              <button
                key={i}
                onClick={() => handleSelectLap(i)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-800'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-blue-400 hover:text-blue-600 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span className="font-semibold">L{i + 1}</span>
                {dist && <span>{dist}</span>}
                {dur && <span className={isSelected ? 'text-blue-400' : 'text-slate-400'}>{dur}</span>}
                {hr && <span className={isSelected ? 'text-red-500' : 'text-red-400'}>{hr}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Lap stats card (when zoomed into a lap) */}
      {selectedLap != null && laps[selectedLap] && (
        <LapStatsCard lap={laps[selectedLap]} />
      )}

      {/* Overlay chart (when 2+ metrics pinned) */}
      {overlayList.length >= 2 && (
        <OverlayChart
          data={chartData}
          metrics={overlayList}
          xMode={xMode}
          showLaps={showLapLines}
          lapBoundaries={lapBoundaries}
          onUnpin={toggleOverlay}
        />
      )}

      {/* Individual charts for all available metrics */}
      {availableMetrics.map(m => (
        <SingleChart
          key={m.key}
          data={chartData}
          metric={m}
          xMode={xMode}
          showLaps={showLapLines}
          lapBoundaries={lapBoundaries}
          isPinned={overlayMetrics.has(m.key)}
          overlayFull={overlayMetrics.size >= MAX_OVERLAY}
          onTogglePin={() => toggleOverlay(m.key)}
        />
      ))}

      {records.length === 0 && (
        <div className="text-center text-slate-400 py-12">No record data available for charts</div>
      )}
    </div>
  );
}
