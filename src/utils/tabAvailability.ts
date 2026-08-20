import type { FitRecord, ParsedFitData } from '../types/fit';

export type Tab = 'charts' | 'map' | 'tables' | 'edit';

/**
 * Metrics worth plotting. Distance is deliberately excluded: it is derived for
 * every GPX track, so including it would enable the charts tab for a bare
 * position-only route that has nothing else to show.
 */
const CHARTABLE_METRICS: (keyof FitRecord)[] = [
  'heart_rate',
  'speed',
  'enhanced_speed',
  'power',
  'cadence',
  'altitude',
  'enhanced_altitude',
  'temperature',
];

function hasPosition(records: FitRecord[]): boolean {
  return records.some(r => r.position_lat != null && r.position_long != null);
}

function hasChartableMetric(records: FitRecord[]): boolean {
  return records.some(r => CHARTABLE_METRICS.some(key => typeof r[key] === 'number'));
}

export function tabDisabledReason(tab: Tab, data: ParsedFitData): string | undefined {
  const { records } = data;

  switch (tab) {
    case 'map':
      return hasPosition(records) ? undefined : 'No GPS data in this file';
    case 'charts':
      return hasChartableMetric(records) ? undefined : 'No chartable metrics in this file';
    case 'tables':
      return records.length > 0 ? undefined : 'This file has no records';
    case 'edit':
      if (data.source === 'gpx') return 'Editing is only available for FIT files, not GPX';
      return records.length > 0 ? undefined : 'This file has no records';
  }
}

export function isTabEnabled(tab: Tab, data: ParsedFitData): boolean {
  return tabDisabledReason(tab, data) === undefined;
}

/**
 * The tab to open a freshly loaded file on: the first enabled tab in order of
 * preference. GPX leads with the map, since the route is the whole point.
 */
export function defaultTab(data: ParsedFitData): Tab {
  const preference: Tab[] =
    data.source === 'gpx'
      ? ['map', 'charts', 'tables']
      : ['charts', 'map', 'tables', 'edit'];

  return preference.find(tab => isTabEnabled(tab, data)) ?? 'charts';
}
