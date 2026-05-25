import type { FitRecord, SessionTotals } from '../types/fit';

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

  const hr = records.map(r => r.heart_rate).filter((v): v is number => typeof v === 'number');

  const totals: SessionTotals = {
    total_elapsed_time: totalElapsed,
    total_timer_time: totalElapsed,
    total_distance: totalDistance,
  };

  if (hr.length > 0) {
    totals.avg_heart_rate = Math.round(hr.reduce((a, b) => a + b, 0) / hr.length);
    totals.max_heart_rate = Math.max(...hr);
  }

  return totals;
}
