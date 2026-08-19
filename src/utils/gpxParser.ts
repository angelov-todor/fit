import type { FitRecord, FitSession, ParsedFitData } from '../types/fit';
import { computeSessionTotals } from './fitStats';
import { MAX_FILE_SIZE } from './fitParser';

const EARTH_RADIUS_M = 6_371_000;

/**
 * Extension elements mapped onto FitRecord fields. Keys are lowercased local
 * names, so any namespace prefix (gpxtpx:, ns3:, none) resolves the same way.
 */
const EXTENSION_FIELDS: Record<string, keyof FitRecord> = {
  hr: 'heart_rate',
  cad: 'cadence',
  atemp: 'temperature',
  powerinwatts: 'power',
  power: 'power',
};

function num(text: string | null): number | undefined {
  if (text === null) return undefined;
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** Great-circle distance in metres between two positions. */
function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parsePoint(el: Element): FitRecord | null {
  const lat = num(el.getAttribute('lat'));
  const lon = num(el.getAttribute('lon'));
  if (lat === undefined || lon === undefined) return null;

  const record: FitRecord = { position_lat: lat, position_long: lon };

  for (const child of Array.from(el.getElementsByTagName('*'))) {
    const name = child.localName.toLowerCase();
    const text = child.textContent;

    if (name === 'ele') {
      const ele = num(text);
      if (ele !== undefined) record.altitude = ele;
      continue;
    }

    if (name === 'time') {
      const time = new Date((text ?? '').trim());
      if (!Number.isNaN(time.getTime())) record.timestamp = time;
      continue;
    }

    const field = EXTENSION_FIELDS[name];
    if (field) {
      const value = num(text);
      if (value !== undefined) (record as Record<string, unknown>)[field] = value;
    }
  }

  return record;
}

/**
 * GPX carries neither distance nor speed, so both are derived from the
 * geometry. Speed needs timestamps and is left off when they are absent.
 */
function addDerivedMetrics(records: FitRecord[]): void {
  let distance = 0;

  records.forEach((record, i) => {
    if (i === 0) {
      record.distance = 0;
      if (record.timestamp) record.speed = 0;
      return;
    }

    const prev = records[i - 1];
    const step = haversineMeters(
      prev.position_lat as number, prev.position_long as number,
      record.position_lat as number, record.position_long as number,
    );
    distance += step;
    record.distance = distance;

    if (record.timestamp && prev.timestamp) {
      const dt = (record.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
      if (dt > 0) record.speed = step / dt;
    }
  });
}

function buildSession(records: FitRecord[], sport?: string): FitSession {
  const session: FitSession = { ...computeSessionTotals(records) };

  if (records[0]?.timestamp) {
    session.start_time = records[0].timestamp;
    session.timestamp = records[records.length - 1].timestamp;
  } else {
    // A route without timestamps has no duration; reporting the computed zero
    // would show a "0:00" duration card for a file that never had a clock.
    delete session.total_elapsed_time;
    delete session.total_timer_time;
  }

  if (sport) session.sport = sport;
  return session;
}

/** The activity type declared on the first track or route, if any. */
function readSport(doc: Document): string | undefined {
  for (const container of ['trk', 'rte']) {
    const parent = doc.getElementsByTagName(container)[0];
    if (!parent) continue;
    for (const child of Array.from(parent.children)) {
      if (child.localName.toLowerCase() === 'type') {
        const text = child.textContent?.trim();
        if (text) return text;
      }
    }
  }
  return undefined;
}

export function parseGpxString(xml: string): ParsedFitData {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Could not parse GPX file: malformed XML');
  }
  if (doc.documentElement?.localName.toLowerCase() !== 'gpx') {
    throw new Error('Not a GPX file: missing <gpx> root element');
  }

  // Tracks are the normal case; routes cover planned-route exports.
  let pointEls = Array.from(doc.getElementsByTagName('trkpt'));
  if (pointEls.length === 0) pointEls = Array.from(doc.getElementsByTagName('rtept'));

  const records = pointEls
    .map(parsePoint)
    .filter((r): r is FitRecord => r !== null);

  if (records.length === 0) {
    throw new Error('No track points found in GPX file');
  }

  addDerivedMetrics(records);
  const session = buildSession(records, readSport(doc));

  return {
    records,
    laps: [],
    sessions: [session],
    device_infos: [],
    events: [],
    rawMessages: {
      records: records as Record<string, unknown>[],
      sessions: [session as Record<string, unknown>],
    },
    source: 'gpx',
  };
}

export async function parseGpxFile(file: File): Promise<ParsedFitData> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum supported size is 100 MB.`,
    );
  }
  return parseGpxString(await file.text());
}
