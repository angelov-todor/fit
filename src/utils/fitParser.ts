import FitParser from 'fit-file-parser';
import JSZip from 'jszip';
import type { ParsedFitData } from '../types/fit';

export const MS_TO_KMH = 3.6;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export async function parseFitFile(file: File): Promise<ParsedFitData> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum supported size is 100 MB.`);
  }

  let buffer: ArrayBuffer;

  if (file.name.toLowerCase().endsWith('.zip')) {
    buffer = await extractFitFromZip(file);
  } else {
    buffer = await file.arrayBuffer();
  }

  return parseFitBuffer(buffer);
}

async function extractFitFromZip(file: File): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const zipData = await zip.loadAsync(await file.arrayBuffer());

  const fitFiles = Object.keys(zipData.files).filter(
    name => name.toLowerCase().endsWith('.fit')
  );

  if (fitFiles.length === 0) {
    throw new Error('No FIT files found in ZIP archive');
  }

  const fitFile = zipData.files[fitFiles[0]];
  const content = await fitFile.async('arraybuffer');
  return content;
}

function parseFitBuffer(buffer: ArrayBuffer): Promise<ParsedFitData> {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: 'm/s',
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'both',
    });

    parser.parse(buffer, (error, data) => {
      if (error || !data) {
        reject(new Error(error ?? 'Failed to parse FIT file'));
        return;
      }

      const raw = data as unknown as Record<string, unknown>;
      const rawMessages: Record<string, Record<string, unknown>[]> = {};

      Object.keys(raw).forEach(key => {
        if (Array.isArray(raw[key])) {
          rawMessages[key] = raw[key] as Record<string, unknown>[];
        } else if (raw[key] && typeof raw[key] === 'object') {
          rawMessages[key] = [raw[key] as Record<string, unknown>];
        }
      });

      const parsed: ParsedFitData = {
        records: (raw.records as Record<string, unknown>[]) || [],
        laps: (raw.laps as Record<string, unknown>[]) || [],
        sessions: (raw.sessions as Record<string, unknown>[]) || [],
        activity: (raw.activity as Record<string, unknown>) || undefined,
        device_infos: (raw.device_infos as Record<string, unknown>[]) || [],
        file_id: (raw.file_id as Record<string, unknown>) || undefined,
        events: (raw.events as Record<string, unknown>[]) || [],
        rawMessages,
      };

      resolve(parsed);
    });
  });
}

export function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;

  const escapeCsvField = (str: string) =>
    str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;

  const keys = Array.from(new Set(data.flatMap(row => Object.keys(row))));
  const header = keys.map(escapeCsvField).join(',');
  const rows = data.map(row =>
    keys.map(key => {
      const val = row[key];
      if (val === null || val === undefined) return '';
      return escapeCsvField(String(val));
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');
  downloadText(csv, filename, 'text/csv');
}

export function exportToGPX(records: Record<string, unknown>[], filename: string): void {
  const trackPoints = records
    .filter(r => r.position_lat != null && r.position_long != null)
    .map(r => {
      const lat = r.position_lat as number;
      const lon = r.position_long as number;
      const ele = (r.enhanced_altitude ?? r.altitude) as number | undefined;
      const time = r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp ?? '');
      return `    <trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">
      ${ele != null ? `<ele>${ele.toFixed(1)}</ele>` : ''}
      ${time ? `<time>${time}</time>` : ''}
    </trkpt>`;
    });

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FIT File Viewer" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${filename.replace('.gpx', '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</name>
    <trkseg>
${trackPoints.join('\n')}
    </trkseg>
  </trk>
</gpx>`;

  downloadText(gpx, filename, 'application/gpx+xml');
}

function downloadText(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value instanceof Date) return value.toLocaleString();

  if (typeof value === 'number') {
    if (key === 'speed' || key === 'avg_speed' || key === 'max_speed' || key === 'enhanced_speed') {
      return `${(value * MS_TO_KMH).toFixed(2)} km/h`;
    }
    if (key === 'distance' || key === 'total_distance') {
      return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${value.toFixed(0)} m`;
    }
    if (key === 'altitude' || key === 'enhanced_altitude' || key === 'avg_altitude' || key === 'max_altitude') {
      return `${value.toFixed(1)} m`;
    }
    if (key === 'heart_rate' || key === 'avg_heart_rate' || key === 'max_heart_rate') {
      return `${value} bpm`;
    }
    if (key === 'power' || key === 'avg_power' || key === 'max_power') {
      return `${value} W`;
    }
    if (key === 'cadence' || key === 'avg_cadence' || key === 'max_cadence') {
      return `${value} rpm`;
    }
    if (key === 'temperature') {
      return `${value}°C`;
    }
    if (key === 'total_elapsed_time' || key === 'total_timer_time') {
      return formatDuration(value);
    }
    if (key === 'position_lat' || key === 'position_long') {
      return `${value.toFixed(7)}°`;
    }
    return value.toFixed(2);
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return Array.isArray(value) ? '[array]' : '[object]';
    }
  }

  return String(value);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
