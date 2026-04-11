// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatDuration, formatValue, exportToCSV, exportToGPX, parseFitFile, MS_TO_KMH } from '../utils/fitParser';

// ── formatDuration ──────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('formats hours, minutes and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('pads minutes and seconds with zeros', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('truncates fractional seconds', () => {
    expect(formatDuration(90.7)).toBe('1:30');
  });

  it('formats large durations', () => {
    expect(formatDuration(36000)).toBe('10:00:00');
  });
});

// ── formatValue ─────────────────────────────────────────────────────────────

describe('formatValue', () => {
  it('returns em dash for null', () => {
    expect(formatValue('anything', null)).toBe('—');
  });

  it('returns em dash for undefined', () => {
    expect(formatValue('anything', undefined)).toBe('—');
  });

  it('formats Date values', () => {
    const d = new Date('2026-04-11T12:00:00Z');
    const result = formatValue('timestamp', d);
    // locale-dependent, just check it's not empty
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });

  it('converts speed from m/s to km/h', () => {
    expect(formatValue('speed', 10)).toBe(`${(10 * MS_TO_KMH).toFixed(2)} km/h`);
    expect(formatValue('avg_speed', 5)).toBe(`${(5 * MS_TO_KMH).toFixed(2)} km/h`);
    expect(formatValue('max_speed', 12)).toBe(`${(12 * MS_TO_KMH).toFixed(2)} km/h`);
    expect(formatValue('enhanced_speed', 8)).toBe(`${(8 * MS_TO_KMH).toFixed(2)} km/h`);
  });

  it('formats distance in meters for < 1000', () => {
    expect(formatValue('distance', 500)).toBe('500 m');
    expect(formatValue('total_distance', 999)).toBe('999 m');
  });

  it('formats distance in km for >= 1000', () => {
    expect(formatValue('distance', 1500)).toBe('1.50 km');
    expect(formatValue('total_distance', 42195)).toBe('42.20 km');
  });

  it('formats altitude', () => {
    expect(formatValue('altitude', 150.6)).toBe('150.6 m');
    expect(formatValue('enhanced_altitude', 200)).toBe('200.0 m');
    expect(formatValue('avg_altitude', 100.12)).toBe('100.1 m');
    expect(formatValue('max_altitude', 300)).toBe('300.0 m');
  });

  it('formats heart rate', () => {
    expect(formatValue('heart_rate', 165)).toBe('165 bpm');
    expect(formatValue('avg_heart_rate', 155)).toBe('155 bpm');
    expect(formatValue('max_heart_rate', 191)).toBe('191 bpm');
  });

  it('formats power', () => {
    expect(formatValue('power', 250)).toBe('250 W');
    expect(formatValue('avg_power', 200)).toBe('200 W');
    expect(formatValue('max_power', 400)).toBe('400 W');
  });

  it('formats cadence', () => {
    expect(formatValue('cadence', 90)).toBe('90 rpm');
    expect(formatValue('avg_cadence', 85)).toBe('85 rpm');
    expect(formatValue('max_cadence', 110)).toBe('110 rpm');
  });

  it('formats temperature', () => {
    expect(formatValue('temperature', 22)).toBe('22°C');
  });

  it('formats elapsed time as duration', () => {
    expect(formatValue('total_elapsed_time', 3661)).toBe('1:01:01');
    expect(formatValue('total_timer_time', 125)).toBe('2:05');
  });

  it('formats position coordinates', () => {
    expect(formatValue('position_lat', 42.1234567)).toBe('42.1234567°');
    expect(formatValue('position_long', -71.9876543)).toBe('-71.9876543°');
  });

  it('formats unknown numeric keys with 2 decimals', () => {
    expect(formatValue('some_metric', 3.14159)).toBe('3.14');
  });

  it('converts non-numeric non-null values to string', () => {
    expect(formatValue('sport', 'cycling')).toBe('cycling');
    expect(formatValue('flag', true)).toBe('true');
  });
});

// ── MS_TO_KMH constant ─────────────────────────────────────────────────────

describe('MS_TO_KMH', () => {
  it('equals 3.6', () => {
    expect(MS_TO_KMH).toBe(3.6);
  });

  it('correctly converts 1 m/s to 3.6 km/h', () => {
    expect(1 * MS_TO_KMH).toBeCloseTo(3.6);
  });
});

// ── parseFitFile size guard ─────────────────────────────────────────────────

describe('parseFitFile', () => {
  it('rejects files over 100 MB', async () => {
    const bigFile = new File(['x'], 'big.fit', { type: 'application/octet-stream' });
    Object.defineProperty(bigFile, 'size', { value: 101 * 1024 * 1024 });

    await expect(parseFitFile(bigFile)).rejects.toThrow('File too large');
    await expect(parseFitFile(bigFile)).rejects.toThrow('Maximum supported size is 100 MB');
  });

  it('accepts files at exactly 100 MB', async () => {
    const file = new File(['x'], 'ok.fit', { type: 'application/octet-stream' });
    Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 });

    // Won't throw size error — will fail at FIT parsing instead, which is fine
    await expect(parseFitFile(file)).rejects.not.toThrow('File too large');
  });
});

// ── exportToCSV ─────────────────────────────────────────────────────────────

// Helper: mock downloadText DOM APIs and capture Blob content
function mockDownload() {
  let captured = '';
  const mockAnchor = { href: '', download: '', click: vi.fn() };
  vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  const OrigBlob = Blob;
  vi.stubGlobal('Blob', class MockBlob extends OrigBlob {
    constructor(parts: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      captured = parts.map(p => typeof p === 'string' ? p : '').join('');
    }
  });

  return { getContent: () => captured };
}

describe('exportToCSV', () => {
  let getContent: () => string;

  beforeEach(() => {
    ({ getContent } = mockDownload());
  });

  it('does nothing for empty data', () => {
    exportToCSV([], 'empty.csv');
    expect(getContent()).toBe('');
  });

  it('generates correct header and rows', () => {
    exportToCSV([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ], 'people.csv');

    const lines = getContent().split('\n');
    expect(lines[0]).toBe('name,age');
    expect(lines[1]).toBe('Alice,30');
    expect(lines[2]).toBe('Bob,25');
  });

  it('escapes fields containing commas', () => {
    exportToCSV([{ note: 'hello, world' }], 'test.csv');
    const lines = getContent().split('\n');
    expect(lines[1]).toBe('"hello, world"');
  });

  it('escapes fields containing quotes', () => {
    exportToCSV([{ note: 'say "hi"' }], 'test.csv');
    const lines = getContent().split('\n');
    expect(lines[1]).toBe('"say ""hi"""');
  });

  it('escapes fields containing newlines', () => {
    exportToCSV([{ note: 'line1\nline2' }], 'test.csv');
    const lines = getContent().split('\n');
    // The field is wrapped in quotes, so the newline is inside the quotes
    expect(getContent()).toContain('"line1\nline2"');
  });

  it('handles null and undefined values as empty', () => {
    exportToCSV([{ a: null, b: undefined, c: 'ok' }], 'test.csv');
    const lines = getContent().split('\n');
    expect(lines[1]).toBe(',,ok');
  });

  it('unions keys from all rows', () => {
    exportToCSV([
      { a: 1 },
      { b: 2 },
    ], 'test.csv');

    const lines = getContent().split('\n');
    expect(lines[0]).toBe('a,b');
    expect(lines[1]).toBe('1,');
    expect(lines[2]).toBe(',2');
  });
});

// ── exportToGPX ─────────────────────────────────────────────────────────────

describe('exportToGPX', () => {
  let getContent: () => string;

  beforeEach(() => {
    ({ getContent } = mockDownload());
  });

  it('generates valid GPX structure', () => {
    exportToGPX([
      { position_lat: 42.0, position_long: -71.0, altitude: 100, timestamp: new Date('2026-01-01T12:00:00Z') },
    ], 'test.gpx');

    expect(getContent()).toContain('<?xml version="1.0"');
    expect(getContent()).toContain('<gpx version="1.1"');
    expect(getContent()).toContain('<name>test</name>');
    expect(getContent()).toContain('lat="42.0000000"');
    expect(getContent()).toContain('lon="-71.0000000"');
    expect(getContent()).toContain('<ele>100.0</ele>');
    expect(getContent()).toContain('<time>2026-01-01T12:00:00.000Z</time>');
  });

  it('skips records without GPS coordinates', () => {
    exportToGPX([
      { position_lat: 42.0, position_long: -71.0 },
      { heart_rate: 150 }, // no GPS
      { position_lat: 43.0, position_long: -72.0 },
    ], 'test.gpx');

    const matches = getContent().match(/<trkpt/g);
    expect(matches).toHaveLength(2);
  });

  it('prefers enhanced_altitude over altitude', () => {
    exportToGPX([
      { position_lat: 42.0, position_long: -71.0, altitude: 100, enhanced_altitude: 105.5 },
    ], 'test.gpx');

    expect(getContent()).toContain('<ele>105.5</ele>');
    expect(getContent()).not.toContain('<ele>100.0</ele>');
  });

  it('escapes XML special characters in filename', () => {
    exportToGPX([
      { position_lat: 42.0, position_long: -71.0 },
    ], 'ride <A&B>.gpx');

    expect(getContent()).toContain('<name>ride &lt;A&amp;B&gt;</name>');
  });

  it('handles records with no elevation', () => {
    exportToGPX([
      { position_lat: 42.0, position_long: -71.0 },
    ], 'flat.gpx');

    expect(getContent()).not.toContain('<ele>');
  });
});
