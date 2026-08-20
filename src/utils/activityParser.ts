import JSZip from 'jszip';
import { MAX_FILE_SIZE, parseFitBuffer } from './fitParser';
import { parseGpxString } from './gpxParser';
import type { ParsedFitData } from '../types/fit';

/** ZIP entries the archive creator added, never the activity itself. */
function isMetadataEntry(path: string): boolean {
  return path.startsWith('__MACOSX/') || path.split('/').pop()?.startsWith('._') === true;
}

async function parseZip(file: File): Promise<ParsedFitData> {
  const zip = await new JSZip().loadAsync(await file.arrayBuffer());

  const entries = Object.keys(zip.files).filter(
    name => !zip.files[name].dir && !isMetadataEntry(name),
  );

  // FIT is the richer format, so prefer it when an archive holds both.
  const fitEntry = entries.find(name => name.toLowerCase().endsWith('.fit'));
  if (fitEntry) {
    return parseFitBuffer(await zip.files[fitEntry].async('arraybuffer'));
  }

  const gpxEntry = entries.find(name => name.toLowerCase().endsWith('.gpx'));
  if (gpxEntry) {
    return parseGpxString(await zip.files[gpxEntry].async('string'));
  }

  throw new Error('No FIT or GPX file found in ZIP archive');
}

/** Parses any activity file the app accepts, routing on the file extension. */
export async function parseActivityFile(file: File): Promise<ParsedFitData> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum supported size is 100 MB.`,
    );
  }

  const name = file.name.toLowerCase();

  if (name.endsWith('.zip')) return parseZip(file);
  if (name.endsWith('.gpx')) return parseGpxString(await file.text());
  return parseFitBuffer(await file.arrayBuffer());
}
