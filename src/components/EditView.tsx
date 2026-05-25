import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import TrimChart, { type TrimMetric } from './TrimChart';
import { trimFitData } from '../utils/fitTrim';
import { encodeFit } from '../utils/fitEncoder';
import { formatDuration, MS_TO_KMH } from '../utils/fitParser';
import type { ParsedFitData } from '../types/fit';

interface Props {
  data: ParsedFitData;
  fileName: string;
}

const ALL_METRICS: { key: TrimMetric; label: string }[] = [
  { key: 'heart_rate', label: 'Heart Rate' },
  { key: 'speed',      label: 'Speed' },
  { key: 'power',      label: 'Power' },
  { key: 'cadence',    label: 'Cadence' },
  { key: 'altitude',   label: 'Altitude' },
];

function hasMetric(records: ParsedFitData['records'], metric: TrimMetric): boolean {
  if (metric === 'altitude') {
    return records.some(r => typeof r.enhanced_altitude === 'number' || typeof r.altitude === 'number');
  }
  return records.some(r => typeof r[metric] === 'number');
}

export default function EditView({ data, fileName }: Props) {
  const { records } = data;

  const availableMetrics = useMemo(
    () => ALL_METRICS.filter(m => hasMetric(records, m.key)),
    [records],
  );

  const [metric, setMetric] = useState<TrimMetric>(
    availableMetrics[0]?.key ?? 'heart_rate',
  );
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(Math.max(0, records.length - 1));
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  if (records.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        This file has no records to edit.
      </div>
    );
  }

  const startRec = records[startIndex];
  const endRec = records[endIndex];
  const originalStart = records[0];
  const originalEnd = records[records.length - 1];

  const elapsed =
    startRec.timestamp && endRec.timestamp
      ? (endRec.timestamp.getTime() - startRec.timestamp.getTime()) / 1000
      : 0;
  const distance =
    typeof startRec.distance === 'number' && typeof endRec.distance === 'number'
      ? endRec.distance - startRec.distance
      : 0;
  const lapsKept = data.laps.filter(
    l =>
      l.start_time != null &&
      l.timestamp != null &&
      startRec.timestamp != null &&
      endRec.timestamp != null &&
      l.start_time >= startRec.timestamp &&
      l.timestamp <= endRec.timestamp,
  ).length;

  const startOffsetSec =
    startRec.timestamp && originalStart.timestamp
      ? (startRec.timestamp.getTime() - originalStart.timestamp.getTime()) / 1000
      : 0;
  const endOffsetSec =
    endRec.timestamp && originalEnd.timestamp
      ? (endRec.timestamp.getTime() - originalEnd.timestamp.getTime()) / 1000
      : 0;

  const fmtOffset = (s: number) => {
    const sign = s >= 0 ? '+' : '-';
    return `${sign}${formatDuration(Math.abs(s))}`;
  };

  const canExport = endIndex - startIndex >= 1 && elapsed > 0;

  const handleExport = () => {
    setError(null);
    setExporting(true);
    try {
      if (!startRec.timestamp || !endRec.timestamp) {
        throw new Error('Records are missing timestamps.');
      }
      const trimmed = trimFitData(data, {
        start: startRec.timestamp,
        end: endRec.timestamp,
      });
      const bytes = encodeFit(trimmed);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}-trimmed.fit`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Trim Activity</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Drag the handles below the chart to choose the new start and end points.
        </p>
      </div>

      {availableMetrics.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600 dark:text-slate-300">Metric:</label>
          <select
            value={metric}
            onChange={e => setMetric(e.target.value as TrimMetric)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1"
          >
            {availableMetrics.map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <TrimChart
          records={records}
          metric={metric}
          startIndex={startIndex}
          endIndex={endIndex}
          onRangeChange={(s, e) => { setStartIndex(s); setEndIndex(e); }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">Start</div>
          <div className="font-mono text-slate-800 dark:text-slate-100">
            {startRec.timestamp?.toLocaleTimeString() ?? '—'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {fmtOffset(startOffsetSec)} from original start
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">End</div>
          <div className="font-mono text-slate-800 dark:text-slate-100">
            {endRec.timestamp?.toLocaleTimeString() ?? '—'}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {fmtOffset(endOffsetSec)} from original end
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-3 text-sm">
        <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1">
          Preview
        </div>
        {canExport ? (
          <div className="text-slate-700 dark:text-slate-200">
            {formatDuration(elapsed)}
            {' · '}
            {distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${distance.toFixed(0)} m`}
            {' · '}
            {lapsKept} / {data.laps.length} laps kept
            {' · '}
            1 session
          </div>
        ) : (
          <div className="text-slate-500 dark:text-slate-400">Range contains no data.</div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleExport}
          disabled={!canExport || exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting…' : 'Export trimmed FIT'}
        </button>
      </div>

      {/* Reference: avg/max stats are computed for export only.
          MS_TO_KMH is imported to stay consistent with the rest of the app
          in case future preview enhancements want km/h speed display. */}
      <span className="hidden">{MS_TO_KMH}</span>
    </div>
  );
}
