export interface FitRecord {
  timestamp?: Date;
  position_lat?: number;
  position_long?: number;
  altitude?: number;
  heart_rate?: number;
  cadence?: number;
  distance?: number;
  speed?: number;
  power?: number;
  temperature?: number;
  enhanced_altitude?: number;
  enhanced_speed?: number;
  [key: string]: unknown;
}

export interface FitLap {
  timestamp?: Date;
  start_time?: Date;
  start_position_lat?: number;
  start_position_long?: number;
  end_position_lat?: number;
  end_position_long?: number;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  total_cycles?: number;
  total_calories?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_cadence?: number;
  max_cadence?: number;
  avg_power?: number;
  max_power?: number;
  avg_altitude?: number;
  max_altitude?: number;
  lap_trigger?: string;
  sport?: string;
  [key: string]: unknown;
}

export interface FitSession {
  timestamp?: Date;
  start_time?: Date;
  sport?: string;
  sub_sport?: string;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  total_calories?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_cadence?: number;
  max_cadence?: number;
  avg_power?: number;
  max_power?: number;
  total_ascent?: number;
  total_descent?: number;
  [key: string]: unknown;
}

export interface FitActivity {
  timestamp?: Date;
  total_timer_time?: number;
  num_sessions?: number;
  type?: string;
  event?: string;
  event_type?: string;
  [key: string]: unknown;
}

export interface FitDeviceInfo {
  timestamp?: Date;
  manufacturer?: string;
  product?: number;
  serial_number?: number;
  software_version?: number;
  hardware_version?: number;
  [key: string]: unknown;
}

export interface FitFileId {
  type?: string;
  manufacturer?: string;
  product?: number;
  serial_number?: number;
  time_created?: Date;
  [key: string]: unknown;
}

export interface ParsedFitData {
  records: FitRecord[];
  laps: FitLap[];
  sessions: FitSession[];
  activity?: FitActivity;
  device_infos: FitDeviceInfo[];
  file_id?: FitFileId;
  events: Record<string, unknown>[];
  rawMessages: Record<string, Record<string, unknown>[]>;
}

export interface FitEvent {
  timestamp?: Date;
  event?: string;          // e.g. 'timer'
  event_type?: string;     // e.g. 'start', 'stop_all'
  [key: string]: unknown;
}

export interface SessionTotals {
  total_elapsed_time: number;
  total_timer_time: number;
  total_distance: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_cadence?: number;
  max_cadence?: number;
  avg_power?: number;
  max_power?: number;
  avg_speed?: number;
  max_speed?: number;
  avg_altitude?: number;
  max_altitude?: number;
  min_altitude?: number;
  total_ascent?: number;
  total_descent?: number;
}

export interface TrimRange {
  start: Date;
  end: Date;
}

export interface TrimmedFitData {
  fileId: FitFileId;
  activity: FitActivity;
  sessions: [FitSession];
  laps: FitLap[];
  records: FitRecord[];
  events: FitEvent[];
  deviceInfos: FitDeviceInfo[];
}
