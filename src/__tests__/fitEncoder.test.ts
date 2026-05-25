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
});
