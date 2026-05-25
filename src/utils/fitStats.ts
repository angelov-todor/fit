import type { FitRecord, SessionTotals } from '../types/fit';

function nums(records: FitRecord[], key: keyof FitRecord): number[] {
  return records
    .map(r => r[key])
    .filter((v): v is number => typeof v === 'number');
}

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeSessionTotals(records: FitRecord[]): SessionTotals {
  if (records.length === 0) {
    return { total_elapsed_time: 0, total_timer_time: 0, total_distance: 0 };
  }

  const first = records[0];
  const last = records[records.length - 1];

  const totalElapsed =
    first.timestamp && last.timestamp
      ? (last.timestamp.getTime() - first.timestamp.getTime()) / 1000
      : 0;

  const totalDistance =
    typeof first.distance === 'number' && typeof last.distance === 'number'
      ? last.distance - first.distance
      : 0;

  const totals: SessionTotals = {
    total_elapsed_time: totalElapsed,
    total_timer_time: totalElapsed,
    total_distance: totalDistance,
  };

  // Integer-rounded metrics
  const intMetrics: Array<['heart_rate' | 'cadence' | 'power', keyof SessionTotals, keyof SessionTotals]> = [
    ['heart_rate', 'avg_heart_rate', 'max_heart_rate'],
    ['cadence',    'avg_cadence',    'max_cadence'],
    ['power',      'avg_power',      'max_power'],
  ];
  for (const [src, avgKey, maxKey] of intMetrics) {
    const vs = nums(records, src);
    if (vs.length > 0) {
      (totals as unknown as Record<string, number>)[avgKey] = Math.round(avg(vs));
      (totals as unknown as Record<string, number>)[maxKey] = Math.max(...vs);
    }
  }

  // Float metric: speed
  const speed = nums(records, 'speed');
  if (speed.length > 0) {
    totals.avg_speed = avg(speed);
    totals.max_speed = Math.max(...speed);
  }

  // Altitude: prefer enhanced_altitude, fall back to altitude
  const altitudes = records
    .map(r => (typeof r.enhanced_altitude === 'number' ? r.enhanced_altitude : r.altitude))
    .filter((v): v is number => typeof v === 'number');

  if (altitudes.length > 0) {
    totals.avg_altitude = avg(altitudes);
    totals.max_altitude = Math.max(...altitudes);
    totals.min_altitude = Math.min(...altitudes);

    // 3-point moving average to suppress single-sample noise, then sum deltas
    const smoothed: number[] = altitudes.map((_, i) => {
      const window = altitudes.slice(Math.max(0, i - 1), Math.min(altitudes.length, i + 2));
      return avg(window);
    });

    let ascent = 0;
    let descent = 0;
    for (let i = 1; i < smoothed.length; i++) {
      const d = smoothed[i] - smoothed[i - 1];
      if (d > 0) ascent += d;
      else descent -= d;
    }
    totals.total_ascent = ascent;
    totals.total_descent = descent;
  }

  return totals;
}
