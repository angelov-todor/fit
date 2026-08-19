import { describe, it, expect } from 'vitest';
import { isTabEnabled, tabDisabledReason, defaultTab } from '../utils/tabAvailability';
import type { FitRecord, ParsedFitData } from '../types/fit';

function data(records: FitRecord[], source?: 'fit' | 'gpx'): ParsedFitData {
  return {
    records,
    laps: [],
    sessions: [],
    device_infos: [],
    events: [],
    rawMessages: {},
    source,
  };
}

const gps: FitRecord = { position_lat: 42.7, position_long: 23.3 };

describe('isTabEnabled — map', () => {
  it('is enabled when a record has a position', () => {
    expect(isTabEnabled('map', data([gps]))).toBe(true);
  });

  it('is disabled when no record has a position', () => {
    expect(isTabEnabled('map', data([{ heart_rate: 140 }]))).toBe(false);
  });

  it('is disabled when a record has latitude but no longitude', () => {
    expect(isTabEnabled('map', data([{ position_lat: 42.7 }]))).toBe(false);
  });
});

describe('isTabEnabled — charts', () => {
  it.each([
    ['heart_rate', { heart_rate: 140 }],
    ['speed', { speed: 8.2 }],
    ['enhanced_speed', { enhanced_speed: 8.2 }],
    ['power', { power: 210 }],
    ['cadence', { cadence: 88 }],
    ['altitude', { altitude: 560 }],
    ['enhanced_altitude', { enhanced_altitude: 560 }],
    ['temperature', { temperature: 19 }],
  ])('is enabled when records carry %s', (_label, metric) => {
    expect(isTabEnabled('charts', data([{ ...gps, ...metric }]))).toBe(true);
  });

  it('is disabled for a bare position-only track', () => {
    expect(isTabEnabled('charts', data([gps, gps], 'gpx'))).toBe(false);
  });

  it('is disabled when the only other field is derived distance', () => {
    expect(isTabEnabled('charts', data([{ ...gps, distance: 0 }], 'gpx'))).toBe(false);
  });
});

describe('isTabEnabled — tables', () => {
  it('is enabled whenever there are records', () => {
    expect(isTabEnabled('tables', data([gps]))).toBe(true);
  });

  it('is disabled when there are no records', () => {
    expect(isTabEnabled('tables', data([]))).toBe(false);
  });
});

describe('isTabEnabled — edit', () => {
  it('is enabled for FIT data with records', () => {
    expect(isTabEnabled('edit', data([gps], 'fit'))).toBe(true);
  });

  it('is enabled when source is absent, which means FIT', () => {
    expect(isTabEnabled('edit', data([gps]))).toBe(true);
  });

  it('is disabled for GPX data because trimming re-encodes a FIT file', () => {
    expect(isTabEnabled('edit', data([{ ...gps, heart_rate: 140 }], 'gpx'))).toBe(false);
  });
});

describe('tabDisabledReason', () => {
  it('is undefined for an enabled tab', () => {
    expect(tabDisabledReason('map', data([gps]))).toBeUndefined();
  });

  it('explains that GPX files cannot be edited', () => {
    expect(tabDisabledReason('edit', data([gps], 'gpx'))).toMatch(/GPX/);
  });

  it('explains a missing GPS track', () => {
    expect(tabDisabledReason('map', data([{ heart_rate: 140 }]))).toMatch(/GPS/i);
  });

  it('explains missing chartable metrics', () => {
    expect(tabDisabledReason('charts', data([gps], 'gpx'))).toMatch(/metric/i);
  });

  it('explains missing records', () => {
    expect(tabDisabledReason('tables', data([]))).toMatch(/record/i);
  });
});

describe('defaultTab', () => {
  it('opens the map for a GPX track, where the route is the point', () => {
    expect(defaultTab(data([{ ...gps, altitude: 560 }], 'gpx'))).toBe('map');
  });

  it('opens the map for a position-only GPX track', () => {
    expect(defaultTab(data([gps], 'gpx'))).toBe('map');
  });

  it('opens charts for a FIT file with chartable metrics', () => {
    expect(defaultTab(data([{ ...gps, heart_rate: 140 }], 'fit'))).toBe('charts');
  });

  it('opens the map for a FIT file with GPS but no chartable metrics', () => {
    expect(defaultTab(data([gps], 'fit'))).toBe('map');
  });

  it('opens tables for a FIT file with records but no GPS or metrics', () => {
    expect(defaultTab(data([{ lap_trigger: 'manual' }], 'fit'))).toBe('tables');
  });

  it('falls back to charts when nothing is enabled', () => {
    expect(defaultTab(data([]))).toBe('charts');
  });
});
