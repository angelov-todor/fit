import { useMemo } from 'react';
import type { ParsedFitData } from '../types/fit';
import { formatDuration, formatElevation, MS_TO_KMH } from '../utils/fitParser';
import { Heart, Zap, Gauge, Mountain, Timer, Route, Thermometer, Activity, Flame } from 'lucide-react';

interface Props {
  data: ParsedFitData;
}

interface StatCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

export default function SummaryCards({ data }: Props) {
  const session = data.sessions[0];
  const records = data.records;
  const sport = session?.sport as string | undefined;

  const cards = useMemo(() => {
    const avg = (key: string): number | undefined => {
      const vals = records
        .map(r => r[key])
        .filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) return undefined;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const max = (key: string): number | undefined => {
      const vals = records
        .map(r => r[key])
        .filter((v): v is number => typeof v === 'number');
      if (vals.length === 0) return undefined;
      return vals.reduce((a, b) => Math.max(a, b), -Infinity);
    };

    const totalDistance = session?.total_distance as number | undefined
      ?? (records.at(-1)?.distance as number | undefined);
    const totalTime = session?.total_elapsed_time as number | undefined
      ?? session?.total_timer_time as number | undefined;
    const avgHR = (session?.avg_heart_rate as number | undefined) ?? avg('heart_rate');
    const maxHR = (session?.max_heart_rate as number | undefined) ?? max('heart_rate');
    const avgPower = (session?.avg_power as number | undefined) ?? avg('power');
    const maxPower = (session?.max_power as number | undefined) ?? max('power');
    const avgSpeed = (session?.avg_speed as number | undefined) ?? avg('speed');
    const maxSpeed = (session?.max_speed as number | undefined) ?? max('speed');
    const totalAscent = session?.total_ascent as number | undefined;
    const totalDescent = session?.total_descent as number | undefined;
    const totalCalories = session?.total_calories as number | undefined;
    const avgTemp = avg('temperature');
    const avgCadence = (session?.avg_cadence as number | undefined) ?? avg('cadence');

    return ([
      totalDistance != null && {
        label: 'Distance',
        value: totalDistance >= 1000
          ? `${(totalDistance / 1000).toFixed(2)} km`
          : `${totalDistance.toFixed(0)} m`,
        icon: <Route className="w-5 h-5" />,
        color: 'text-blue-600 bg-blue-50',
      },
      totalTime != null && {
        label: 'Duration',
        value: formatDuration(totalTime),
        icon: <Timer className="w-5 h-5" />,
        color: 'text-purple-600 bg-purple-50',
      },
      totalCalories != null && {
        label: 'Calories',
        value: `${Math.round(totalCalories)} kcal`,
        icon: <Flame className="w-5 h-5" />,
        color: 'text-amber-600 bg-amber-50',
      },
      avgHR != null && {
        label: 'Avg HR',
        value: `${Math.round(avgHR)} bpm${maxHR != null ? ` / max ${maxHR}` : ''}`,
        icon: <Heart className="w-5 h-5" />,
        color: 'text-red-600 bg-red-50',
      },
      avgPower != null && {
        label: 'Avg Power',
        value: `${Math.round(avgPower)} W${maxPower != null ? ` / max ${maxPower}` : ''}`,
        icon: <Zap className="w-5 h-5" />,
        color: 'text-yellow-600 bg-yellow-50',
      },
      avgSpeed != null && {
        label: 'Avg Speed',
        value: `${(avgSpeed * MS_TO_KMH).toFixed(1)} km/h${maxSpeed != null ? ` / max ${(maxSpeed * MS_TO_KMH).toFixed(1)}` : ''}`,
        icon: <Gauge className="w-5 h-5" />,
        color: 'text-green-600 bg-green-50',
      },
      totalAscent != null && {
        label: 'Elevation',
        value: formatElevation(totalAscent, totalDescent),
        icon: <Mountain className="w-5 h-5" />,
        color: 'text-orange-600 bg-orange-50',
      },
      avgCadence != null && {
        label: 'Avg Cadence',
        value: `${Math.round(avgCadence)} rpm`,
        icon: <Activity className="w-5 h-5" />,
        color: 'text-indigo-600 bg-indigo-50',
      },
      avgTemp != null && {
        label: 'Avg Temp',
        value: `${avgTemp.toFixed(1)}°C`,
        icon: <Thermometer className="w-5 h-5" />,
        color: 'text-cyan-600 bg-cyan-50',
      },
    ] as (StatCard | false)[]).filter(Boolean) as StatCard[];
  }, [data, session, records]);

  if (cards.length === 0) return null;

  return (
    <div>
      {sport && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-medium text-slate-500">Activity:</span>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 capitalize">{sport}</span>
          {session?.sub_sport && (
            <span className="text-xs text-slate-400 capitalize">({String(session.sub_sport)})</span>
          )}
          {session?.start_time instanceof Date && (
            <span className="text-xs text-slate-400 ml-2">
              {session.start_time.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {cards.map(card => (
          <div key={card.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg ${card.color} flex-shrink-0`}>
              {card.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">{card.label}</div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{card.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
