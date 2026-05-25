import { describe, it, expect } from 'vitest';
import { encodeFit } from '../utils/fitEncoder';
import { parseFitFile } from '../utils/fitParser';
import type { TrimmedFitData } from '../types/fit';

const t = (s: number) => new Date(2026, 0, 1, 9, 0, s);

function tinyTrimmed(): TrimmedFitData {
  return {
    fileId: { type: 'activity', manufacturer: 'garmin', product: 1, serial_number: 1, time_created: t(0) },
    activity: { timestamp: t(4), total_timer_time: 4, num_sessions: 1 },
    sessions: [{
      timestamp: t(4),
      start_time: t(0),
      total_elapsed_time: 4,
      total_timer_time: 4,
      total_distance: 40,
      num_laps: 1,
      sport: 'cycling',
    }],
    laps: [{ start_time: t(0), timestamp: t(4), total_elapsed_time: 4, total_distance: 40 }],
    records: Array.from({ length: 5 }, (_, i) => ({
      timestamp: t(i),
      distance: i * 10,
      heart_rate: 100 + i,
    })),
    events: [
      { timestamp: t(0), event: 'timer', event_type: 'start' },
      { timestamp: t(4), event: 'timer', event_type: 'stop_all' },
    ],
    deviceInfos: [],
  };
}

describe('encodeFit — roundtrip', () => {
  it('produces bytes that fit-file-parser can decode without error', async () => {
    const bytes = encodeFit(tinyTrimmed());
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(20); // FIT header is 12-14 bytes + content + 2-byte CRC

    // Wrap in a File so we can reuse parseFitFile
    // Cast through unknown to satisfy strict ArrayBuffer vs ArrayBufferLike TS constraint
    const file = new File([bytes as unknown as ArrayBuffer], 'roundtrip.fit', { type: 'application/octet-stream' });
    const parsed = await parseFitFile(file);

    expect(parsed.records).toHaveLength(5);
    expect(parsed.records[0].heart_rate).toBe(100);
    expect(parsed.records[4].heart_rate).toBe(104);
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.sessions[0].total_distance).toBeCloseTo(40, 1);
    expect(parsed.laps).toHaveLength(1);
  });

  it('preserves GPS positions through the degrees ↔ semicircles roundtrip', async () => {
    const data: TrimmedFitData = {
      fileId: { type: 'activity', manufacturer: 'garmin', product: 1, time_created: t(0) },
      activity: { timestamp: t(2), total_timer_time: 2, num_sessions: 1 },
      sessions: [{
        timestamp: t(2),
        start_time: t(0),
        total_elapsed_time: 2,
        total_timer_time: 2,
        total_distance: 20,
        num_laps: 1,
        sport: 'cycling',
      }],
      laps: [{
        start_time: t(0),
        timestamp: t(2),
        total_elapsed_time: 2,
        total_distance: 20,
        start_position_lat: 42.5,
        start_position_long: -71.25,
        end_position_lat: 42.5005,
        end_position_long: -71.2495,
      }],
      records: [
        { timestamp: t(0), distance: 0,  position_lat: 42.5,    position_long: -71.25 },
        { timestamp: t(1), distance: 10, position_lat: 42.5002, position_long: -71.2498 },
        { timestamp: t(2), distance: 20, position_lat: 42.5005, position_long: -71.2495 },
      ],
      events: [
        { timestamp: t(0), event: 'timer', event_type: 'start' },
        { timestamp: t(2), event: 'timer', event_type: 'stop_all' },
      ],
      deviceInfos: [],
    };

    const bytes = encodeFit(data);
    const file = new File([bytes as unknown as ArrayBuffer], 'gps.fit', { type: 'application/octet-stream' });
    const parsed = await parseFitFile(file);

    // Records roundtrip back to degrees. Tolerance: one semicircle ≈ 8.4e-8 deg.
    expect(parsed.records[0].position_lat).toBeCloseTo(42.5,    5);
    expect(parsed.records[0].position_long).toBeCloseTo(-71.25, 5);
    expect(parsed.records[2].position_lat).toBeCloseTo(42.5005, 5);
    expect(parsed.records[2].position_long).toBeCloseTo(-71.2495, 5);

    // Lap GPS positions roundtrip too
    expect(parsed.laps[0].start_position_lat).toBeCloseTo(42.5,    5);
    expect(parsed.laps[0].end_position_long).toBeCloseTo(-71.2495, 5);
  });
});
