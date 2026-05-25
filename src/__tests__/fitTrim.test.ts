import { describe, it, expect } from 'vitest';
import { trimFitData } from '../utils/fitTrim';
import type { ParsedFitData, FitRecord, FitLap } from '../types/fit';

const t = (s: number) => new Date(2026, 0, 1, 9, 0, s);

function makeFitData(): ParsedFitData {
  const records: FitRecord[] = Array.from({ length: 10 }, (_, i) => ({
    timestamp: t(i),
    distance: 100 + i * 10, // 100, 110, 120, ..., 190
    heart_rate: 100 + i,
  }));

  const laps: FitLap[] = [
    { start_time: t(0), timestamp: t(2), total_distance: 20 }, // lap 1: records 0-2
    { start_time: t(3), timestamp: t(6), total_distance: 30 }, // lap 2: records 3-6
    { start_time: t(7), timestamp: t(9), total_distance: 20 }, // lap 3: records 7-9
  ];

  return {
    records,
    laps,
    sessions: [{ total_distance: 90, total_elapsed_time: 9, total_calories: 100 }],
    activity: { total_timer_time: 9, num_sessions: 1 },
    device_infos: [],
    file_id: { time_created: t(0) },
    events: [
      { timestamp: t(0), event: 'timer', event_type: 'start' },
      { timestamp: t(9), event: 'timer', event_type: 'stop_all' },
    ],
    rawMessages: {},
  };
}

describe('trimFitData — record filtering', () => {
  it('keeps records inside the trim range (inclusive)', () => {
    const data = makeFitData();
    const result = trimFitData(data, { start: t(2), end: t(7) });
    expect(result.records).toHaveLength(6); // records at t=2..7
    expect(result.records[0].timestamp).toEqual(t(2));
    expect(result.records[result.records.length - 1].timestamp).toEqual(t(7));
  });

  it('normalizes distance so the first kept record starts at 0', () => {
    const data = makeFitData();
    const result = trimFitData(data, { start: t(2), end: t(7) });
    expect(result.records[0].distance).toBe(0);   // was 120
    expect(result.records[5].distance).toBe(50);  // was 170
  });
});

describe('trimFitData — lap filtering', () => {
  it('keeps laps fully inside range, drops partial and outside laps', () => {
    const data = makeFitData();
    const result = trimFitData(data, { start: t(2), end: t(7) });
    // lap 1 (t0-t2): touches range start, but start_time t0 < range.start t2 → drop
    // lap 2 (t3-t6): fully inside → keep
    // lap 3 (t7-t9): timestamp t9 > range.end t7 → drop
    expect(result.laps).toHaveLength(1);
    expect(result.laps[0].start_time).toEqual(t(3));
  });

  it('keeps a lap whose boundaries equal the trim boundaries', () => {
    const data = makeFitData();
    const result = trimFitData(data, { start: t(3), end: t(6) });
    expect(result.laps).toHaveLength(1);
    expect(result.laps[0].start_time).toEqual(t(3));
  });
});

describe('trimFitData — events', () => {
  it('keeps events inside the trim range', () => {
    const data = makeFitData();
    // Add a pause/resume pair inside the range
    data.events.push(
      { timestamp: t(4), event: 'timer', event_type: 'stop' },
      { timestamp: t(5), event: 'timer', event_type: 'start' },
    );
    const result = trimFitData(data, { start: t(2), end: t(7) });
    // Original boundary events are outside the range; intermediate pause/resume is inside
    expect(result.events.some(e => e.timestamp?.getTime() === t(4).getTime())).toBe(true);
    expect(result.events.some(e => e.timestamp?.getTime() === t(5).getTime())).toBe(true);
  });

  it('synthesizes a start event at range.start when missing', () => {
    const data = makeFitData();
    const result = trimFitData(data, { start: t(2), end: t(7) });
    const first = result.events[0];
    expect(first.timestamp).toEqual(t(2));
    expect(first.event).toBe('timer');
    expect(first.event_type).toBe('start');
  });

  it('synthesizes a stop event at range.end when missing', () => {
    const data = makeFitData();
    const result = trimFitData(data, { start: t(2), end: t(7) });
    const last = result.events[result.events.length - 1];
    expect(last.timestamp).toEqual(t(7));
    expect(last.event).toBe('timer');
    expect(last.event_type).toBe('stop_all');
  });

  it('does not duplicate a start event that is already at range.start', () => {
    const data = makeFitData();
    // Push a start event exactly at t(2)
    data.events.push({ timestamp: t(2), event: 'timer', event_type: 'start' });
    const result = trimFitData(data, { start: t(2), end: t(7) });
    const startsAtT2 = result.events.filter(
      e => e.timestamp?.getTime() === t(2).getTime() && e.event_type === 'start',
    );
    expect(startsAtT2).toHaveLength(1);
  });
});

describe('trimFitData — session and activity rollup', () => {
  it('recomputes session totals from trimmed records', () => {
    const data = makeFitData();
    const result = trimFitData(data, { start: t(2), end: t(7) });
    expect(result.sessions[0].total_elapsed_time).toBe(5);  // t7 - t2
    expect(result.sessions[0].total_distance).toBe(50);     // normalized 50 - 0
    expect(result.sessions[0].num_laps).toBe(1);
  });

  it('scales total_calories proportionally to elapsed time', () => {
    const data = makeFitData();
    // Original session has total_calories: 100 over 9s. Trim to 5s.
    const result = trimFitData(data, { start: t(2), end: t(7) });
    expect(result.sessions[0].total_calories).toBeCloseTo((100 * 5) / 9, 5);
  });

  it('updates activity total_timer_time and num_sessions=1', () => {
    const data = makeFitData();
    const result = trimFitData(data, { start: t(2), end: t(7) });
    expect(result.activity.total_timer_time).toBe(5);
    expect(result.activity.num_sessions).toBe(1);
  });
});
