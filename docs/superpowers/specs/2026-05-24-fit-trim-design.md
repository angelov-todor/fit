# FIT Trim Editor

## Context

The app is currently a read-only FIT viewer. This is the first editor feature: let the user pick a new start and a new end time, and download a valid `.fit` file containing only the kept range. The output must load cleanly in this same viewer, in Garmin Connect, and in Strava.

Scope is intentionally narrow:

- Trim **start and/or end only** — no middle cuts, no multiple segments.
- Single-session activities. Multi-session files collapse to one session in the output.
- v1 ships as a new **Edit** tab; further edit features can grow inside the same tab later.

## Files

### New

| File | Purpose |
|---|---|
| `src/components/EditView.tsx` | The Edit tab. Hosts the trim chart, controls, preview, and export button. |
| `src/components/TrimChart.tsx` | Single Recharts chart with two draggable handles defining the kept range. |
| `src/utils/fitTrim.ts` | Pure: `(ParsedFitData, {start, end}) → TrimmedFitData`. Filters records, drops partial/outside laps, calls `fitStats`, copies metadata. |
| `src/utils/fitStats.ts` | Pure: `(FitRecord[]) → SessionTotals`. Computes totals/avg/max for time, distance, HR, power, cadence, speed, altitude, ascent/descent. |
| `src/utils/fitEncoder.ts` | Wraps `@garmin/fitsdk` Encoder. `(TrimmedFitData) → Uint8Array`. |
| `src/__tests__/fitStats.test.ts` | Unit tests for stats math. |
| `src/__tests__/fitTrim.test.ts` | Unit tests for trim filtering and lap rules. |
| `src/__tests__/fitEncoder.test.ts` | Roundtrip: encode → re-parse with `fit-file-parser`, assert validity. |

### Modified

| File | Change |
|---|---|
| `src/App.tsx` | Add fourth tab `edit` with a `Scissors` icon (Lucide). Pass `fitData` and `fileName` into `EditView`. |
| `package.json` | Add `@garmin/fitsdk` dependency. |

## Decisions

These were settled during brainstorming and are not open for re-litigation during implementation. Push back if any turn out to be wrong in practice.

1. **Trim scope:** start and/or end only.
2. **Range selection:** drag handles on a chart of one selected metric. Handles snap to the nearest record timestamp.
3. **Placement:** new Edit tab, fourth after Charts / Map / Tables.
4. **Encoder:** `@garmin/fitsdk` (Garmin's official JS SDK), used only for writing. `fit-file-parser` continues to handle reading.
5. **Lap handling:** keep laps fully inside the kept range; drop any lap that lies partly or fully outside.
6. **Session/activity totals:** recompute from kept records.

## Architecture

### Data flow

1. App-level state already holds `fitData: ParsedFitData` after upload.
2. User opens the Edit tab → `EditView` mounts with `data` and `fileName` props.
3. `EditView` local state: `trimStart: Date`, `trimEnd: Date`, initialized to the first and last record timestamps. Plus `metric: string` for which line the chart draws.
4. `TrimChart` renders one Recharts `LineChart` of the chosen metric. Two `ReferenceLine` elements plus draggable handle dots set `trimStart` / `trimEnd`. Outside-range regions get a translucent gray `ReferenceArea` overlay.
5. On every drag, `EditView` recomputes a cheap preview (duration, distance, lap count) directly from the original `fitData` and the current trim range.
6. On **Export trimmed FIT**: `trimFitData(fitData, { start, end })` → `encodeFit(trimmed)` → `Uint8Array` → Blob download as `<fileName>-trimmed.fit`.

### `fitTrim.ts`

```ts
export interface TrimRange { start: Date; end: Date; }

export interface TrimmedFitData {
  fileId: FitFileId;
  activity: FitActivity;
  sessions: [FitSession];           // exactly one
  laps: FitLap[];                   // fully-contained only
  records: FitRecord[];             // distance-normalized to start at 0
  events: FitEvent[];               // includes synthetic start/stop if originals fell outside
  deviceInfos: FitDeviceInfo[];     // copied as-is
}

export function trimFitData(data: ParsedFitData, range: TrimRange): TrimmedFitData;
```

Rules, applied in order:

```
records = data.records.filter(r =>
  r.timestamp >= range.start && r.timestamp <= range.end
);

// Distance normalization: every kept record's cumulative `distance` becomes
// `original_distance - firstKept.distance`, so the trimmed file starts at 0 m.

laps = data.laps.filter(l =>
  l.start_time >= range.start && l.timestamp <= range.end
);
// l.timestamp is the lap-end timestamp in fit-file-parser output.

events = data.events.filter(e =>
  e.timestamp >= range.start && e.timestamp <= range.end
);
// Events are kept in chronological order. After filtering, ensure the kept
// list opens with a `timer/start` event at range.start and closes with a
// `timer/stop` event at range.end. If the original start/stop pair fell
// outside the kept range, synthesize the missing event(s) at the boundaries.
// Intermediate pause/resume event pairs (if any) are preserved as-is.

deviceInfos = data.device_infos;  // unchanged
fileId      = data.file_id;       // unchanged (time_created kept)

newTotals = fitStats.computeSessionTotals(records);
session   = {
  ...data.sessions[0],
  ...newTotals,
  start_time: records[0].timestamp,
  timestamp:  records[records.length - 1].timestamp,
  num_laps:   laps.length,
};
activity = {
  ...data.activity,
  total_timer_time: newTotals.total_timer_time,
  timestamp:        records[records.length - 1].timestamp,
  num_sessions:     1,
};
```

If `data.sessions.length > 1`, the spread of `data.sessions[0]` collapses to one session; this is the documented v1 limitation.

### `fitStats.ts`

```ts
export interface SessionTotals {
  total_elapsed_time: number;     // seconds
  total_timer_time: number;       // seconds (= elapsed in v1)
  total_distance: number;         // meters
  avg_heart_rate?: number;
  max_heart_rate?: number;
  avg_cadence?: number;
  max_cadence?: number;
  avg_power?: number;
  max_power?: number;
  avg_speed?: number;             // m/s
  max_speed?: number;             // m/s
  avg_altitude?: number;          // meters
  max_altitude?: number;
  min_altitude?: number;
  total_ascent?: number;          // meters
  total_descent?: number;         // meters
}

export function computeSessionTotals(records: FitRecord[]): SessionTotals;
```

Formulas:

| Field | Formula |
|---|---|
| `total_elapsed_time` | `(last.timestamp - first.timestamp) / 1000` |
| `total_timer_time` | Same as elapsed in v1. Pause-aware computation deferred until we need it. |
| `total_distance` | `last.distance - first.distance` |
| `avg_X` (HR / cadence / power) | Mean of non-null record values, rounded to nearest integer |
| `max_X` (HR / cadence / power) | Max of non-null record values |
| `avg_speed`, `max_speed` | Mean / max of non-null `speed` in m/s |
| `avg_altitude`, `max_altitude`, `min_altitude` | Mean / max / min of `enhanced_altitude ?? altitude` |
| `total_ascent` | Sum of positive deltas between consecutive altitude samples, after a 3-point moving average to suppress noise. |
| `total_descent` | Same but negative deltas, returned as a positive sum. |

Two fields are set in `fitTrim.ts` rather than `fitStats.ts` because they depend on more than the record stream:

- `total_calories`: scaled in `fitTrim.ts` as `originalSession.total_calories * (newTotalElapsed / originalTotalElapsed)`. Coarse but reasonable for v1; alternatives (power-based, MET-based) need inputs we don't have.
- `num_laps`: set in `fitTrim.ts` as `laps.length`, since it depends on the filtered `laps`, not on records.

When a metric has zero non-null values, the corresponding `avg_*` / `max_*` field is **omitted** from the output (left `undefined`) rather than written as `0`.

### `fitEncoder.ts`

Wraps `@garmin/fitsdk`'s `Encoder`. Writes messages in this order:

1. `FileIdMesg` — from `trimmed.fileId`.
2. `DeviceInfoMesg` × N — from `trimmed.deviceInfos`.
3. `RecordMesg`, `LapMesg`, and `EventMesg` messages — interleaved in chronological order by timestamp. `trimmed.events` already starts with a `timer/start` event at the new start time and ends with a `timer/stop` event at the new end time, with any intermediate pause/resume events preserved between them.
4. `SessionMesg` — from `trimmed.sessions[0]`.
5. `ActivityMesg` — from `trimmed.activity`.

The encoder produces a `Uint8Array` with valid header CRC and file CRC. The exact `@garmin/fitsdk` API surface (constructor, message classes, finalize call) is verified during implementation; if the SDK does not expose a particular field that `fit-file-parser` did, that field is dropped rather than blocking the export.

### `EditView.tsx`

Layout:

```
┌─────────────────────────────────────────────────────────────┐
│ Trim Activity                                               │
│ Drag the handles to choose the new start and end points.    │
├─────────────────────────────────────────────────────────────┤
│ Metric: [ Heart Rate ▼ ]                                    │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │       ░░░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░             │ │
│ │    ╱╲  ╱╲  ▓ ╱╲  ╱╲╱╲   ╱╲  ╱╲╱╲╱╲  ▓                  │ │
│ │   ╱  ╲╱  ╲╱ ▓╱  ╲╱    ╲╱  ╲╱        ╲▓ ╲╱╲             │ │
│ │ ─────────●━━━━━━━━━━━━━━━━━━━━━━━━━━━●──────  ← handles│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  Start:  09:14:23   ( +2m 13s from original start )         │
│  End:    10:42:11   ( -5m 47s from original end )           │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Preview                                                 │ │
│ │   1h 27m 48s   23.4 km   8 / 12 laps kept   1 session   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                                  [  Export trimmed FIT  ]   │
└─────────────────────────────────────────────────────────────┘
```

`TrimChart` props:

```ts
interface TrimChartProps {
  records: FitRecord[];
  metric: 'heart_rate' | 'speed' | 'power' | 'cadence' | 'altitude';
  start: Date;
  end: Date;
  onChange: (next: { start: Date; end: Date }) => void;
}
```

Handle interaction:

- Each handle is a circular SVG dot positioned at the top of a `ReferenceLine`.
- `onMouseDown` on a handle captures pointer; `onMouseMove` on the chart container maps clientX → time via the xAxis scale (Recharts exposes this via the chart instance ref or by reading the scale off the underlying SVG).
- On move, the new time is **snapped to the nearest record timestamp** (binary search over `records`). This guarantees the filter boundary always coincides with a real data point.
- Constraints: `start` can never exceed `end - 2 records`; `end` can never go below `start + 2 records`.
- Touch handlers (`touchstart`, `touchmove`, `touchend`) mirror the mouse handlers.

Metric selector:

- Dropdown showing only metrics where at least one record has a non-null value for that field.
- If no metrics qualify (data has no HR/speed/power/cadence/altitude), the chart shows record index on the Y axis with a horizontal line — purely so the user has something to drag handles against.

Tab integration in `App.tsx`:

```ts
type Tab = 'charts' | 'map' | 'tables' | 'edit';
const tabs = [
  // ...existing entries...
  { id: 'edit', label: 'Edit', icon: <Scissors className="w-4 h-4" /> },
];
// ...
{activeTab === 'edit' && <EditView data={fitData} fileName={fileName} />}
```

Dark mode uses the same Tailwind classes as the rest of the app (`bg-white dark:bg-slate-800`, `text-slate-800 dark:text-slate-100`, etc.). No new color tokens.

Export download uses a `Blob` with type `application/octet-stream` and filename `<fileName>-trimmed.fit`, following the same pattern as `downloadText` in `fitParser.ts` but for `Uint8Array`.

## Error handling

| Condition | Behavior |
|---|---|
| `trimStart >= trimEnd` | Export button disabled; preview shows "Invalid range." |
| Fewer than 2 records in range | Export button disabled; preview shows "Range contains no data." |
| Original file has 0 records | Edit tab still renders, but shows "This file has no records to edit." No chart. |
| Encoder throws | Caught in `EditView`; shown as a red error banner styled like the existing load-error banner. |
| `@garmin/fitsdk` import fails | Build-time TS error; not a runtime concern. |

## Testing

### `fitStats.test.ts`

- Empty record stream → all fields zero or undefined.
- Single record → zero duration, zero distance, single-value avg/max where metrics exist.
- Constant-altitude stream → `total_ascent === 0`, `total_descent === 0`.
- Monotonically rising altitude → `total_ascent` matches the total rise within rounding.
- Mixed records where some have `heart_rate` undefined → avg/max ignore the gaps; result is integer.
- Stream with no HR, no power → those fields are omitted (undefined), not zeroed.

### `fitTrim.test.ts`

- Synthetic `ParsedFitData` with 5 records spaced 1 second apart and 3 laps:
  - Trim to records 1..3 → laps inside the range survive; laps overlapping either edge are dropped.
  - Trim boundaries exactly equal to a lap's `start_time` and `timestamp` → that lap survives (boundary inclusive).
  - Trim to records that produce an empty result → returns a `TrimmedFitData` with `records: []` (caller is responsible for never calling encode in that state).
- Distance normalization: trimmed records' `distance` values start at 0; deltas between consecutive trimmed records match the original deltas.
- Multi-session input: only `sessions[0]` is preserved in output; this is asserted to confirm the documented limitation.

### `fitEncoder.test.ts`

- Build a small `TrimmedFitData` with file_id + 5 records + 1 lap + 1 session + 1 activity.
- Encode it.
- Parse the resulting `Uint8Array` with `fit-file-parser`.
- Assert: parser returns no error; record count matches; session `total_distance` and `total_elapsed_time` match within 0.01; `file_id.time_created` matches.

### Manual verification

After unit tests pass: load a real FIT file, drag handles, export, then drop the exported `.fit` back into the same viewer. Confirm it loads, the records render correctly, the preview numbers match what the summary cards show.

## Pre-commit gate

Per `CLAUDE.md`, `npm test` and `npm run build` must both pass before commit and push. No CI config changes.

## Out of scope (deliberately deferred)

- Middle-segment cuts.
- Multiple cuts before export.
- Multi-session output.
- Pause-aware `total_timer_time` (requires walking event start/stop pairs).
- Power-based or HR-based calorie recomputation.
- Lap clipping/recomputation for partial laps.
- Editing fields other than the time range (e.g. correcting sport type, renaming).
