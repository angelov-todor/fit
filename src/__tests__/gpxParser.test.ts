import { describe, it, expect } from 'vitest';
import { parseGpxString, parseGpxFile } from '../utils/gpxParser';

const gpx = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
${inner}
</gpx>`;

const trk = (points: string, type = '') =>
  gpx(`  <trk>${type ? `<type>${type}</type>` : ''}<trkseg>
${points}
  </trkseg></trk>`);

describe('parseGpxString — track point extraction', () => {
  it('extracts latitude and longitude from each trkpt', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="42.6977" lon="23.3219"/>
      <trkpt lat="42.6980" lon="23.3225"/>
    `));

    expect(data.records).toHaveLength(2);
    expect(data.records[0].position_lat).toBeCloseTo(42.6977, 6);
    expect(data.records[0].position_long).toBeCloseTo(23.3219, 6);
    expect(data.records[1].position_lat).toBeCloseTo(42.6980, 6);
  });

  it('extracts elevation into altitude', () => {
    const data = parseGpxString(trk(`<trkpt lat="42.7" lon="23.3"><ele>562.4</ele></trkpt>`));
    expect(data.records[0].altitude).toBeCloseTo(562.4, 3);
  });

  it('extracts time into a Date timestamp', () => {
    const data = parseGpxString(trk(`<trkpt lat="42.7" lon="23.3"><time>2026-04-11T07:15:30Z</time></trkpt>`));
    const ts = data.records[0].timestamp;
    expect(ts).toBeInstanceOf(Date);
    expect(ts?.toISOString()).toBe('2026-04-11T07:15:30.000Z');
  });

  it('leaves altitude and timestamp undefined when the trkpt omits them', () => {
    const data = parseGpxString(trk(`<trkpt lat="42.7" lon="23.3"/>`));
    expect(data.records[0].altitude).toBeUndefined();
    expect(data.records[0].timestamp).toBeUndefined();
  });

  it('concatenates points across multiple tracks and segments in document order', () => {
    const data = parseGpxString(gpx(`
      <trk><trkseg><trkpt lat="1" lon="1"/><trkpt lat="2" lon="2"/></trkseg>
           <trkseg><trkpt lat="3" lon="3"/></trkseg></trk>
      <trk><trkseg><trkpt lat="4" lon="4"/></trkseg></trk>
    `));

    expect(data.records.map(r => r.position_lat)).toEqual([1, 2, 3, 4]);
  });

  it('falls back to rte/rtept when the file has no track', () => {
    const data = parseGpxString(gpx(`
      <rte><rtept lat="42.7" lon="23.3"><ele>500</ele></rtept>
           <rtept lat="42.8" lon="23.4"/></rte>
    `));

    expect(data.records).toHaveLength(2);
    expect(data.records[0].altitude).toBeCloseTo(500, 3);
  });

  it('tags the parsed data with source "gpx"', () => {
    const data = parseGpxString(trk(`<trkpt lat="42.7" lon="23.3"/>`));
    expect(data.source).toBe('gpx');
  });

  it('returns empty laps, events and device infos', () => {
    const data = parseGpxString(trk(`<trkpt lat="42.7" lon="23.3"/>`));
    expect(data.laps).toEqual([]);
    expect(data.events).toEqual([]);
    expect(data.device_infos).toEqual([]);
  });
});

describe('parseGpxString — extensions', () => {
  it('maps gpxtpx heart rate, cadence and temperature regardless of prefix', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="42.7" lon="23.3"><extensions>
        <gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
          <gpxtpx:hr>142</gpxtpx:hr>
          <gpxtpx:cad>87</gpxtpx:cad>
          <gpxtpx:atemp>21.5</gpxtpx:atemp>
        </gpxtpx:TrackPointExtension>
      </extensions></trkpt>
      <trkpt lat="42.8" lon="23.4"><extensions>
        <ns3:TrackPointExtension xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
          <ns3:hr>150</ns3:hr>
        </ns3:TrackPointExtension>
      </extensions></trkpt>
    `));

    expect(data.records[0].heart_rate).toBe(142);
    expect(data.records[0].cadence).toBe(87);
    expect(data.records[0].temperature).toBeCloseTo(21.5, 3);
    expect(data.records[1].heart_rate).toBe(150);
  });

  it('maps PowerInWatts to power', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="42.7" lon="23.3"><extensions>
        <gpxpx:PowerExtension xmlns:gpxpx="http://www.garmin.com/xmlschemas/PowerExtension/v1">
          <gpxpx:PowerInWatts>235</gpxpx:PowerInWatts>
        </gpxpx:PowerExtension>
      </extensions></trkpt>
    `));

    expect(data.records[0].power).toBe(235);
  });

  it('maps a bare <power> extension element to power', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="42.7" lon="23.3"><extensions><power>180</power></extensions></trkpt>
    `));

    expect(data.records[0].power).toBe(180);
  });
});

describe('parseGpxString — derived distance and speed', () => {
  it('accumulates great-circle distance, starting at zero', () => {
    // One degree of latitude at the equator is ~111.195 km.
    const data = parseGpxString(trk(`
      <trkpt lat="0" lon="0"/>
      <trkpt lat="1" lon="0"/>
    `));

    expect(data.records[0].distance).toBe(0);
    expect(data.records[1].distance as number).toBeCloseTo(111194.9, 0);
  });

  it('keeps distance cumulative across three points', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="0" lon="0"/>
      <trkpt lat="1" lon="0"/>
      <trkpt lat="2" lon="0"/>
    `));

    expect(data.records[2].distance as number).toBeCloseTo(2 * 111194.9, 0);
  });

  it('derives speed in m/s from the distance and time between points', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="0" lon="0"><time>2026-04-11T07:00:00Z</time></trkpt>
      <trkpt lat="0.001" lon="0"><time>2026-04-11T07:00:10Z</time></trkpt>
    `));

    // 111.195 m covered in 10 s.
    expect(data.records[0].speed).toBe(0);
    expect(data.records[1].speed as number).toBeCloseTo(11.12, 2);
  });

  it('omits speed entirely when the file has no timestamps', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="0" lon="0"/>
      <trkpt lat="0.001" lon="0"/>
    `));

    expect(data.records.every(r => r.speed === undefined)).toBe(true);
  });

  it('omits speed for a point that repeats the previous timestamp', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="0" lon="0"><time>2026-04-11T07:00:00Z</time></trkpt>
      <trkpt lat="0.001" lon="0"><time>2026-04-11T07:00:00Z</time></trkpt>
    `));

    expect(data.records[1].speed).toBeUndefined();
    expect(data.records[1].distance as number).toBeCloseTo(111.195, 2);
  });
});

describe('parseGpxString — synthesized session', () => {
  it('summarizes the track into a single session', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="0" lon="0"><ele>100</ele><time>2026-04-11T07:00:00Z</time></trkpt>
      <trkpt lat="0.001" lon="0"><ele>110</ele><time>2026-04-11T07:00:30Z</time></trkpt>
    `));

    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].total_elapsed_time).toBe(30);
    expect(data.sessions[0].total_distance as number).toBeCloseTo(111.195, 2);
    expect(data.sessions[0].max_altitude).toBeCloseTo(110, 3);
    expect(data.sessions[0].start_time).toEqual(new Date('2026-04-11T07:00:00Z'));
  });

  it('omits duration from the session when the track has no timestamps', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="0" lon="0"/>
      <trkpt lat="0.001" lon="0"/>
    `));

    expect(data.sessions[0].total_elapsed_time).toBeUndefined();
    expect(data.sessions[0].total_timer_time).toBeUndefined();
    expect(data.sessions[0].start_time).toBeUndefined();
    // Distance comes from the geometry, so it survives.
    expect(data.sessions[0].total_distance as number).toBeCloseTo(111.195, 2);
  });

  it('takes the session sport from the track <type>', () => {
    const data = parseGpxString(trk(`<trkpt lat="0" lon="0"/>`, 'cycling'));
    expect(data.sessions[0].sport).toBe('cycling');
  });

  it('leaves sport undefined when the track has no <type>', () => {
    const data = parseGpxString(trk(`<trkpt lat="0" lon="0"/>`));
    expect(data.sessions[0].sport).toBeUndefined();
  });

  it('exposes records and the session in rawMessages for the tables view', () => {
    const data = parseGpxString(trk(`<trkpt lat="0" lon="0"/>`));
    expect(data.rawMessages.records).toHaveLength(1);
    expect(data.rawMessages.sessions).toHaveLength(1);
  });
});

describe('parseGpxString — invalid input', () => {
  it('throws when the GPX has no track or route points', () => {
    expect(() => parseGpxString(gpx('  <trk><trkseg></trkseg></trk>')))
      .toThrow(/no track points/i);
  });

  it('throws when the root element is not <gpx>', () => {
    expect(() => parseGpxString('<kml><Placemark/></kml>')).toThrow(/gpx/i);
  });

  it('throws on malformed XML', () => {
    expect(() => parseGpxString('<gpx><trk><trkseg</gpx>')).toThrow();
  });

  it('skips trkpt elements missing lat or lon', () => {
    const data = parseGpxString(trk(`
      <trkpt lat="42.7" lon="23.3"/>
      <trkpt lat="42.8"/>
      <trkpt lon="23.5"/>
    `));

    expect(data.records).toHaveLength(1);
  });
});

describe('parseGpxFile', () => {
  it('parses a GPX File', async () => {
    const xml = trk(`<trkpt lat="42.7" lon="23.3"><ele>500</ele></trkpt>`);
    const file = new File([xml], 'ride.gpx', { type: 'application/gpx+xml' });

    const data = await parseGpxFile(file);

    expect(data.records).toHaveLength(1);
    expect(data.records[0].altitude).toBeCloseTo(500, 3);
    expect(data.source).toBe('gpx');
  });
});
