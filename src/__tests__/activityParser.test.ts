import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseActivityFile } from '../utils/activityParser';

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="42.6977" lon="23.3219"><ele>560</ele></trkpt>
    <trkpt lat="42.6980" lon="23.3225"><ele>562</ele></trkpt>
  </trkseg></trk>
</gpx>`;

async function zipFile(entries: Record<string, string>, name = 'archive.zip'): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const blob = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([blob], name, { type: 'application/zip' });
}

describe('parseActivityFile — routing by extension', () => {
  it('routes a .gpx file to the GPX parser', async () => {
    const data = await parseActivityFile(new File([GPX], 'ride.gpx'));

    expect(data.source).toBe('gpx');
    expect(data.records).toHaveLength(2);
  });

  it('routes an uppercase .GPX file to the GPX parser', async () => {
    const data = await parseActivityFile(new File([GPX], 'RIDE.GPX'));
    expect(data.source).toBe('gpx');
  });

  it('routes a .fit file to the FIT parser', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'ride.fit');

    // Garbage bytes, so it must fail — but as a FIT parse failure, not a GPX one.
    await expect(parseActivityFile(file)).rejects.toThrow(/^(?!.*gpx).*$/i);
  });
});

describe('parseActivityFile — ZIP archives', () => {
  it('extracts and parses a GPX entry from a ZIP', async () => {
    const data = await parseActivityFile(await zipFile({ 'ride.gpx': GPX }));

    expect(data.source).toBe('gpx');
    expect(data.records).toHaveLength(2);
  });

  it('prefers a FIT entry over a GPX entry when the ZIP has both', async () => {
    const file = await zipFile({ 'ride.gpx': GPX, 'ride.fit': 'garbage' });

    // Routed to the FIT parser, so it fails on the garbage rather than
    // succeeding via the GPX entry.
    await expect(parseActivityFile(file)).rejects.toThrow();
  });

  it('ignores __MACOSX metadata entries', async () => {
    const file = await zipFile({ '__MACOSX/._ride.fit': 'junk', 'ride.gpx': GPX });

    const data = await parseActivityFile(file);
    expect(data.source).toBe('gpx');
  });

  it('throws when the ZIP holds neither a FIT nor a GPX file', async () => {
    const file = await zipFile({ 'notes.txt': 'hello' });

    await expect(parseActivityFile(file)).rejects.toThrow(/no FIT or GPX file/i);
  });
});

describe('parseActivityFile — size guard', () => {
  it('rejects a GPX file over 100 MB', async () => {
    const file = new File([GPX], 'huge.gpx');
    Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 });

    await expect(parseActivityFile(file)).rejects.toThrow('File too large');
  });
});
