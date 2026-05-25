import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Brush, ReferenceArea, CartesianGrid,
} from 'recharts';
import type { FitRecord } from '../types/fit';

export type TrimMetric = 'heart_rate' | 'speed' | 'power' | 'cadence' | 'altitude';

interface Props {
  records: FitRecord[];
  metric: TrimMetric;
  startIndex: number;
  endIndex: number;
  onRangeChange: (startIndex: number, endIndex: number) => void;
}

interface ChartPoint {
  i: number;
  t: number; // timestamp ms
  v: number | null;
}

function getValue(r: FitRecord, metric: TrimMetric): number | null {
  if (metric === 'altitude') {
    const v = (r.enhanced_altitude ?? r.altitude);
    return typeof v === 'number' ? v : null;
  }
  const v = r[metric];
  return typeof v === 'number' ? v : null;
}

export default function TrimChart({ records, metric, startIndex, endIndex, onRangeChange }: Props) {
  const data: ChartPoint[] = useMemo(
    () =>
      records.map((r, i) => ({
        i,
        t: r.timestamp ? r.timestamp.getTime() : 0,
        v: getValue(r, metric),
      })),
    [records, metric],
  );

  if (data.length < 2) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Not enough data to display a chart.
      </div>
    );
  }

  return (
    <div className="w-full h-80">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="i" tick={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <Tooltip
            formatter={(v: unknown): ReactNode => {
              if (typeof v === 'number') {
                return v.toFixed(1);
              }
              return null;
            }}
            labelFormatter={(label: unknown): ReactNode => {
              if (typeof label === 'number' && data[label]?.t) {
                return new Date(data[label].t).toLocaleTimeString();
              }
              if (typeof label === 'number') {
                return String(label);
              }
              return null;
            }}
          />
          {/* Out-of-range shading */}
          {startIndex > 0 && (
            <ReferenceArea x1={0} x2={startIndex} fill="#94a3b8" fillOpacity={0.25} />
          )}
          {endIndex < data.length - 1 && (
            <ReferenceArea
              x1={endIndex}
              x2={data.length - 1}
              fill="#94a3b8"
              fillOpacity={0.25}
            />
          )}
          <Line
            type="monotone"
            dataKey="v"
            stroke="#2563eb"
            dot={false}
            isAnimationActive={false}
            strokeWidth={1.5}
            connectNulls
          />
          <Brush
            dataKey="i"
            height={28}
            startIndex={startIndex}
            endIndex={endIndex}
            stroke="#2563eb"
            travellerWidth={10}
            onChange={(range: { startIndex?: number; endIndex?: number }) => {
              if (
                typeof range.startIndex === 'number' &&
                typeof range.endIndex === 'number' &&
                range.endIndex > range.startIndex
              ) {
                onRangeChange(range.startIndex, range.endIndex);
              }
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
