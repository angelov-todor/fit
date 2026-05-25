import type {
  ParsedFitData, TrimmedFitData, TrimRange,
  FitRecord, FitLap, FitEvent, FitSession, FitActivity,
} from '../types/fit';
import { computeSessionTotals } from './fitStats';

function inRange<T extends { timestamp?: Date }>(item: T, range: TrimRange): boolean {
  return !!item.timestamp && item.timestamp >= range.start && item.timestamp <= range.end;
}

export function trimFitData(data: ParsedFitData, range: TrimRange): TrimmedFitData {
  const records: FitRecord[] = data.records.filter(r => inRange(r, range));

  // Normalize cumulative distance to start at 0
  const firstDistance =
    records.length > 0 && typeof records[0].distance === 'number'
      ? records[0].distance
      : 0;
  const normalizedRecords: FitRecord[] = records.map(r => ({
    ...r,
    distance:
      typeof r.distance === 'number' ? r.distance - firstDistance : r.distance,
  }));

  const laps: FitLap[] = data.laps.filter(
    l =>
      l.start_time != null &&
      l.timestamp != null &&
      l.start_time >= range.start &&
      l.timestamp <= range.end,
  );

  const filteredEvents: FitEvent[] = (data.events as FitEvent[]).filter(e => inRange(e, range));

  const hasStartAtRange = filteredEvents.some(
    e =>
      e.timestamp?.getTime() === range.start.getTime() &&
      e.event === 'timer' &&
      e.event_type === 'start',
  );
  const hasStopAtRange = filteredEvents.some(
    e =>
      e.timestamp?.getTime() === range.end.getTime() &&
      e.event === 'timer' &&
      (e.event_type === 'stop_all' || e.event_type === 'stop'),
  );

  const events: FitEvent[] = [];
  if (!hasStartAtRange) {
    events.push({ timestamp: range.start, event: 'timer', event_type: 'start' });
  }
  events.push(...filteredEvents);
  if (!hasStopAtRange) {
    events.push({ timestamp: range.end, event: 'timer', event_type: 'stop_all' });
  }

  const totals = computeSessionTotals(normalizedRecords);
  const originalSession = data.sessions[0] ?? {};
  const originalElapsed =
    typeof originalSession.total_elapsed_time === 'number'
      ? originalSession.total_elapsed_time
      : 0;
  const originalCalories =
    typeof originalSession.total_calories === 'number'
      ? originalSession.total_calories
      : undefined;

  const scaledCalories =
    originalCalories != null && originalElapsed > 0
      ? originalCalories * (totals.total_elapsed_time / originalElapsed)
      : originalCalories;

  const session: FitSession = {
    ...originalSession,
    ...totals,
    start_time: normalizedRecords[0]?.timestamp,
    timestamp: normalizedRecords[normalizedRecords.length - 1]?.timestamp,
    num_laps: laps.length,
    total_calories: scaledCalories,
  };

  const activity: FitActivity = {
    ...(data.activity ?? {}),
    total_timer_time: totals.total_timer_time,
    timestamp: normalizedRecords[normalizedRecords.length - 1]?.timestamp,
    num_sessions: 1,
  };

  return {
    fileId: data.file_id ?? {},
    activity,
    sessions: [session],
    laps,
    records: normalizedRecords,
    events,
    deviceInfos: data.device_infos,
  };
}
