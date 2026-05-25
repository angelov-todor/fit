import { Encoder, Profile } from '@garmin/fitsdk';
import type {
  TrimmedFitData, FitRecord, FitLap, FitEvent, FitDeviceInfo, FitFileId, FitSession, FitActivity,
} from '../types/fit';

type Mesg = Record<string, unknown>;

const EVENT_TYPE_TO_SDK: Record<string, string> = {
  stop_all: 'stopAll',
};

function fileIdMesg(f: FitFileId): Mesg {
  return {
    type: f.type ?? 'activity',
    manufacturer: f.manufacturer ?? 'development',
    product: f.product ?? 1,
    serialNumber: f.serial_number,
    timeCreated: f.time_created ?? new Date(),
  };
}

function deviceInfoMesg(d: FitDeviceInfo): Mesg {
  return {
    timestamp: d.timestamp,
    manufacturer: d.manufacturer,
    product: d.product,
    softwareVersion: d.software_version,
    serialNumber: d.serial_number,
  };
}

function recordMesg(r: FitRecord): Mesg {
  return {
    timestamp: r.timestamp,
    distance: r.distance,
    heartRate: r.heart_rate,
    cadence: r.cadence,
    speed: r.speed,
    power: r.power,
    altitude: r.altitude,
    enhancedAltitude: r.enhanced_altitude,
    enhancedSpeed: r.enhanced_speed,
    positionLat: r.position_lat,
    positionLong: r.position_long,
    temperature: r.temperature,
  };
}

function lapMesg(l: FitLap): Mesg {
  return {
    timestamp: l.timestamp,
    startTime: l.start_time,
    startPositionLat: l.start_position_lat,
    startPositionLong: l.start_position_long,
    endPositionLat: l.end_position_lat,
    endPositionLong: l.end_position_long,
    totalElapsedTime: l.total_elapsed_time,
    totalTimerTime: l.total_timer_time,
    totalDistance: l.total_distance,
    totalCalories: l.total_calories,
    avgSpeed: l.avg_speed,
    maxSpeed: l.max_speed,
    avgHeartRate: l.avg_heart_rate,
    maxHeartRate: l.max_heart_rate,
    avgCadence: l.avg_cadence,
    maxCadence: l.max_cadence,
    avgPower: l.avg_power,
    maxPower: l.max_power,
    avgAltitude: l.avg_altitude,
    maxAltitude: l.max_altitude,
    sport: l.sport,
    event: typeof l.event === 'string' ? l.event : 'lap',
    eventType: typeof l.event_type === 'string' ? l.event_type : 'stop',
  };
}

function eventMesg(e: FitEvent): Mesg {
  const raw = typeof e.event_type === 'string' ? e.event_type : undefined;
  const sdkType = raw ? (EVENT_TYPE_TO_SDK[raw] ?? raw) : undefined;
  return {
    timestamp: e.timestamp,
    event: e.event,
    eventType: sdkType,
  };
}

function sessionMesg(s: FitSession): Mesg {
  return {
    timestamp: s.timestamp,
    startTime: s.start_time,
    sport: s.sport,
    subSport: s.sub_sport,
    totalElapsedTime: s.total_elapsed_time,
    totalTimerTime: s.total_timer_time,
    totalDistance: s.total_distance,
    totalCalories: s.total_calories,
    avgHeartRate: s.avg_heart_rate,
    maxHeartRate: s.max_heart_rate,
    avgCadence: s.avg_cadence,
    maxCadence: s.max_cadence,
    avgPower: s.avg_power,
    maxPower: s.max_power,
    avgSpeed: s.avg_speed,
    maxSpeed: s.max_speed,
    avgAltitude: s.avg_altitude,
    maxAltitude: s.max_altitude,
    totalAscent: s.total_ascent,
    totalDescent: s.total_descent,
    numLaps: s.num_laps,
    event: 'session',
    eventType: 'stop',
  };
}

function activityMesg(a: FitActivity): Mesg {
  return {
    timestamp: a.timestamp,
    totalTimerTime: a.total_timer_time,
    numSessions: a.num_sessions ?? 1,
    type: typeof a.type === 'string' ? a.type : 'manual',
    event: 'activity',
    eventType: 'stop',
  };
}

export function encodeFit(data: TrimmedFitData): Uint8Array {
  const encoder = new Encoder();

  encoder.onMesg(Profile.MesgNum.FILE_ID, fileIdMesg(data.fileId));

  for (const d of data.deviceInfos) {
    encoder.onMesg(Profile.MesgNum.DEVICE_INFO, deviceInfoMesg(d));
  }

  type Item = { ts: number; kind: 'record' | 'lap' | 'event'; mesg: Mesg };
  const items: Item[] = [];
  for (const r of data.records) {
    if (r.timestamp) items.push({ ts: r.timestamp.getTime(), kind: 'record', mesg: recordMesg(r) });
  }
  for (const l of data.laps) {
    if (l.timestamp) items.push({ ts: l.timestamp.getTime(), kind: 'lap', mesg: lapMesg(l) });
  }
  for (const e of data.events) {
    if (e.timestamp) items.push({ ts: e.timestamp.getTime(), kind: 'event', mesg: eventMesg(e) });
  }
  items.sort((a, b) => a.ts - b.ts);

  const kindToMesgNum: Record<Item['kind'], number> = {
    record: Profile.MesgNum.RECORD,
    lap: Profile.MesgNum.LAP,
    event: Profile.MesgNum.EVENT,
  };
  for (const item of items) {
    encoder.onMesg(kindToMesgNum[item.kind], item.mesg);
  }

  encoder.onMesg(Profile.MesgNum.SESSION, sessionMesg(data.sessions[0]));
  encoder.onMesg(Profile.MesgNum.ACTIVITY, activityMesg(data.activity));

  return encoder.close();
}
