# `@garmin/fitsdk` Encoder API Notes

> Reference for Task 8 (`fitEncoder.ts`). All findings verified by live Node.js execution.

## Package

- **Name:** `@garmin/fitsdk`
- **Version installed:** `21.205.0`
- **Profile Version:** 21.205.0Release
- **Type:** Pure ESM (`"type": "module"` in package.json)
- **License:** FIT Protocol License (see `node_modules/@garmin/fitsdk/LICENSE.txt`)

## Import Statement

```ts
import { Encoder, Profile } from '@garmin/fitsdk';
// Stream is only needed for the Decoder path — not required for encoding.
// Utils is also available but not needed for basic encoding.
```

The plan's assumed import `import { Encoder, Stream, Profile } from '@garmin/fitsdk'` is **wrong for encoding**: `Stream` is only used to feed bytes into the `Decoder`. The `Encoder` manages its own internal `OutputStream` — no stream argument is needed at construction.

## Constructor

```ts
const encoder = new Encoder();
// Optionally pass developer field descriptions:
// const encoder = new Encoder({ fieldDescriptions: { ... } });
```

- Takes an optional `EncoderOptions` object.
- `EncoderOptions.fieldDescriptions` is only needed if you are writing developer fields (custom fields). For standard activity files, pass nothing.
- Internally allocates a 0.5 MB `ArrayBuffer` with `maxByteLength = 500 MB` and resizes on demand.
- **No stream argument** — unlike what the plan sketch assumed.

## Writing Messages: Two Equivalent APIs

### `onMesg(mesgNum, mesg)` — preferred for clarity

```ts
encoder.onMesg(Profile.MesgNum.FILE_ID, {
  type: 'activity',
  manufacturer: 'development',
  product: 1,
  timeCreated: new Date(),
});
```

- First arg: numeric message number constant from `Profile.MesgNum`.
- Second arg: plain object with **camelCase field names** (see CRITICAL QUIRK below).
- Unknown fields are silently ignored.
- Returns `this` (chainable).

### `writeMesg(mesg)` — requires `mesgNum` inside the object

```ts
encoder.writeMesg({
  mesgNum: Profile.MesgNum.FILE_ID,
  type: 'activity',
  manufacturer: 'development',
  product: 1,
  timeCreated: new Date(),
});
```

- Internally calls `onMesg(mesg.mesgNum, mesg)`.
- The `mesgNum` property is used for routing but its value in the written fields is determined by the Profile — the encoder writes what the Profile says, not the raw `mesgNum` field.

## Message Number Constants (`Profile.MesgNum`)

All constants confirmed by live inspection:

| Message     | `Profile.MesgNum` key | Value |
|-------------|----------------------|-------|
| FileId      | `FILE_ID`            | 0     |
| Lap         | `LAP`                | 19    |
| Record      | `RECORD`             | 20    |
| Event       | `EVENT`              | 21    |
| DeviceInfo  | `DEVICE_INFO`        | 23    |
| Session     | `SESSION`            | 18    |
| Activity    | `ACTIVITY`           | 34    |

## Writing Each Required Message Type

### FileId

```ts
encoder.onMesg(Profile.MesgNum.FILE_ID, {
  type: 'activity',         // Types.File string enum
  manufacturer: 'garmin',   // or 'development' for test files
  product: 1,               // uint16
  serialNumber: 12345,      // uint32z (optional)
  timeCreated: new Date(),  // Date object — SDK converts to FIT epoch
});
```

### DeviceInfo

```ts
encoder.onMesg(Profile.MesgNum.DEVICE_INFO, {
  timestamp: new Date(),
  manufacturer: 'garmin',
  product: 1,
  softwareVersion: 1.0,
});
```

### Record

```ts
encoder.onMesg(Profile.MesgNum.RECORD, {
  timestamp: new Date(),
  distance: 100.5,          // Float64, meters
  heartRate: 145,           // Uint8, bpm — NOTE: heartRate not heart_rate
  cadence: 90,              // Uint8, rpm
  speed: 8.5,               // Float64, m/s
  power: 250,               // Uint16, watts
  altitude: 150.0,          // Float64, meters
  enhancedAltitude: 150.0,  // Float64, meters (preferred over altitude)
  positionLat: 511234567,   // Sint32, semicircles
  positionLong: 21234567,   // Sint32, semicircles
});
```

### Lap

```ts
encoder.onMesg(Profile.MesgNum.LAP, {
  timestamp: new Date(),
  startTime: new Date(),      // NOTE: startTime not start_time
  totalElapsedTime: 300.0,    // Float64, seconds
  totalTimerTime: 295.0,      // Float64, seconds
  totalDistance: 1200.0,      // Float64, meters
  avgHeartRate: 142,          // Uint8
  maxHeartRate: 165,          // Uint8
  avgSpeed: 4.0,              // Float64, m/s
  event: 'lap',
  eventType: 'stop',
});
```

### Event

```ts
encoder.onMesg(Profile.MesgNum.EVENT, {
  timestamp: new Date(),
  event: 'timer',             // Types.Event string enum
  eventType: 'start',         // Types.EventType string enum — NOTE: eventType not event_type
});

// Stop event:
encoder.onMesg(Profile.MesgNum.EVENT, {
  timestamp: new Date(),
  event: 'timer',
  eventType: 'stopAll',       // NOTE: 'stopAll' not 'stop_all'
});
```

### Session

```ts
encoder.onMesg(Profile.MesgNum.SESSION, {
  timestamp: new Date(),
  startTime: new Date(),        // NOTE: startTime not start_time
  sport: 'cycling',             // or 'running', etc.
  totalElapsedTime: 3600.0,     // Float64, seconds
  totalTimerTime: 3550.0,       // Float64, seconds
  totalDistance: 25000.0,       // Float64, meters
  totalCalories: 800,           // Uint16
  avgHeartRate: 142,            // Uint8
  maxHeartRate: 180,            // Uint8
  avgSpeed: 6.9,                // Float64, m/s
  maxSpeed: 12.0,               // Float64, m/s
  avgCadence: 88,               // Uint8
  maxCadence: 110,              // Uint8
  avgPower: 220,                // Uint16
  maxPower: 380,                // Uint16
  numLaps: 4,                   // Uint16 — NOTE: numLaps not num_laps
  event: 'session',
  eventType: 'stop',
});
```

### Activity

```ts
encoder.onMesg(Profile.MesgNum.ACTIVITY, {
  timestamp: new Date(),
  totalTimerTime: 3550.0,  // Float64, seconds — NOTE: totalTimerTime not total_timer_time
  numSessions: 1,          // Uint16 — NOTE: numSessions not num_sessions
  type: 'manual',          // or 'auto_multi_sport'
  event: 'activity',
  eventType: 'stop',
});
```

## Finalize and Obtain Uint8Array

```ts
const uint8Array: Uint8Array = encoder.close();
```

- `close()` finalizes the 14-byte FIT file header (with protocol version, profile version, data size, `.FIT` magic bytes, and header CRC), then appends the 2-byte file CRC.
- Returns a `Uint8Array` directly — no stream `.toUint8Array()` call needed (unlike what the plan assumed).

## CRITICAL QUIRK: camelCase vs snake_case

**The SDK uses camelCase field names. `fit-file-parser` uses snake_case.**

This is the single most important quirk for Task 8. The encoder will **silently ignore** any field whose name is not in the Profile. A snake_case field like `total_elapsed_time` will be treated as an unknown field and dropped — no error, no warning. Only the camelCase name `totalElapsedTime` will be written.

Field name mapping for the fields `fitEncoder.ts` will need to translate:

| `TrimmedFitData` / `fit-file-parser` (snake_case) | SDK Encoder (camelCase)   |
|---------------------------------------------------|---------------------------|
| `time_created`                                    | `timeCreated`             |
| `serial_number`                                   | `serialNumber`            |
| `total_elapsed_time`                              | `totalElapsedTime`        |
| `total_timer_time`                                | `totalTimerTime`          |
| `total_distance`                                  | `totalDistance`           |
| `total_calories`                                  | `totalCalories`           |
| `avg_heart_rate`                                  | `avgHeartRate`            |
| `max_heart_rate`                                  | `maxHeartRate`            |
| `avg_cadence`                                     | `avgCadence`              |
| `max_cadence`                                     | `maxCadence`              |
| `avg_power`                                       | `avgPower`                |
| `max_power`                                       | `maxPower`                |
| `avg_speed`                                       | `avgSpeed`                |
| `max_speed`                                       | `maxSpeed`                |
| `avg_altitude`                                    | (no direct field in Session/Lap) |
| `total_ascent`                                    | `totalAscent`             |
| `total_descent`                                   | `totalDescent`            |
| `start_time`                                      | `startTime`               |
| `num_laps`                                        | `numLaps`                 |
| `num_sessions`                                    | `numSessions`             |
| `heart_rate` (record)                             | `heartRate`               |
| `enhanced_altitude` (record)                      | `enhancedAltitude`        |
| `event_type`                                      | `eventType`               |
| `stop_all` (event_type value)                     | `stopAll` (eventType value) |

**Implication for Task 8:** `fitEncoder.ts` must map all fields from snake_case to camelCase before passing to `encoder.onMesg()`. The simplest approach is an explicit mapping object per message type — do NOT spread `TrimmedFitData` sub-objects directly.

## Additional Quirks

### ESM Only
The package is pure ESM (`"type": "module"`). No CommonJS build. Vite handles this fine.

### Browser Compatibility
The encoder uses only Web APIs (`ArrayBuffer`, `DataView`, `TextEncoder`, `Uint8Array`) and **no Node.js built-ins**. `ArrayBuffer.resize()` (used internally) requires a resizable `ArrayBuffer` — supported in Chrome 111+, Firefox 128+, Safari 16.4+. This is adequate for a modern Vite app.

`Stream.fromBuffer()` (Decoder API) accepts a Node.js `Buffer`, but that is only needed for the decoder path (not encoder). No `Buffer` usage in the encoder path.

### `Stream` is not needed for encoding
The plan sketch assumed `Stream.fromBuffer(new Uint8Array())` was needed. It is not. `Encoder` creates its own internal `OutputStream` automatically.

### Type String Enums
Fields typed as `Types.Event`, `Types.EventType`, `Types.Sport`, `Types.File`, `Types.Manufacturer`, etc. accept their string enum values as returned by the decoder (e.g. `'timer'`, `'start'`, `'stopAll'`, `'cycling'`, `'activity'`, `'garmin'`). They also accept raw numeric values — use strings for readability.

### `stopAll` not `stop_all`
The `eventType` value for the final timer stop is `'stopAll'` (camelCase) in the SDK, not `'stop_all'` (which is what `fit-file-parser` returns). Using `'stop_all'` will silently write an invalid/unknown value.

### `writeMesg` vs `onMesg`
`writeMesg(mesg)` is a thin wrapper that reads `mesg.mesgNum` and calls `onMesg(mesg.mesgNum, mesg)`. Either works. Use `onMesg` for clearer separation of message number from data.

### Local Message Number Pool
The encoder tracks up to 16 "active" local message definitions. If you exceed 16 different message types, it cycles (modulo 16). For an activity file with 7 message types this is not a concern.

### Scale and Offset
The encoder automatically unapplies scale and offset before writing. Pass human-readable values (e.g., `distance: 1587` meters, `speed: 8.5` m/s). The decoder applies scale/offset on read, so roundtrip values should match.

## Recommended `fitEncoder.ts` Pattern

```ts
import { Encoder, Profile } from '@garmin/fitsdk';
import type { TrimmedFitData } from '../types/fit';

export function encodeFit(data: TrimmedFitData): Uint8Array {
  const encoder = new Encoder();

  // 1. FileId — explicit camelCase mapping
  encoder.onMesg(Profile.MesgNum.FILE_ID, {
    type: data.fileId.type ?? 'activity',
    manufacturer: data.fileId.manufacturer ?? 'development',
    product: data.fileId.product ?? 1,
    serialNumber: data.fileId.serial_number,
    timeCreated: data.fileId.time_created ?? new Date(),
  });

  // 2. DeviceInfos
  for (const d of data.deviceInfos) {
    encoder.onMesg(Profile.MesgNum.DEVICE_INFO, {
      timestamp: d.timestamp,
      manufacturer: d.manufacturer,
      product: d.product,
      softwareVersion: d.software_version,
      serialNumber: d.serial_number,
    });
  }

  // 3. Interleave records / laps / events by timestamp (see Task 8 for full implementation)
  // Each message must use camelCase field names.

  // 4. Session
  const s = data.sessions[0];
  encoder.onMesg(Profile.MesgNum.SESSION, {
    timestamp: s.timestamp,
    startTime: s.start_time,
    sport: s.sport,
    totalElapsedTime: s.total_elapsed_time,
    totalTimerTime: s.total_timer_time,
    totalDistance: s.total_distance,
    totalCalories: s.total_calories,
    avgHeartRate: s.avg_heart_rate,
    maxHeartRate: s.max_heart_rate,
    avgCadence: s.avg_cadence,
    avgPower: s.avg_power,
    avgSpeed: s.avg_speed,
    numLaps: s.num_laps,
    event: 'session',
    eventType: 'stop',
  });

  // 5. Activity
  encoder.onMesg(Profile.MesgNum.ACTIVITY, {
    timestamp: data.activity.timestamp,
    totalTimerTime: data.activity.total_timer_time,
    numSessions: 1,
    type: 'manual',
    event: 'activity',
    eventType: 'stop',
  });

  return encoder.close();
}
```

## Verified: Works in Browser (Vite bundled)

The encoder (`output-stream.js`, `encoder.js`, `crc-calculator.js`, `mesg-definition.js`, `profile.js`) uses only Web-standard APIs. The Vite build includes `@garmin/fitsdk` without Node polyfills. Build confirmed passing after install.
