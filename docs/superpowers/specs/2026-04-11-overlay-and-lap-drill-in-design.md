# Overlay & Lap Drill-In Redesign

## Context

The current ChartsView has two interaction patterns that feel bolted on:

1. **Overlay** uses a row of checkboxes in the controls bar that duplicate the chart list. Checked metrics are removed from the individual chart list and placed in a separate overlay chart, which is disorienting.
2. **Lap drill-in** only highlights a region with a faint `ReferenceArea`. No zoom, no stats, no actual drill-in.

This redesign replaces both with more discoverable, integrated interactions.

## File to modify

- `src/components/ChartsView.tsx` (all changes are contained here)

## 1. Per-Chart Pin Toggle (Overlay)

### Behavior

- Each individual chart card gets a **pin icon button** (Lucide `Layers` icon) in its header row, next to the metric label.
- Clicking the pin icon **adds** that metric to a shared overlay chart that renders at the top of the chart list.
- The pinned chart **remains visible** in the individual list but is **dimmed** (wrapper gets `opacity-40`) to indicate it's also in the overlay.
- Clicking the pin icon again **removes** the metric from the overlay and restores full opacity.
- The overlay chart legend shows colored dot + metric name for each pinned metric. Each legend item has an **x button** to unpin directly from the overlay.
- When fewer than 2 metrics are pinned, no overlay chart renders (a single pinned metric just dims in place with no overlay).

### Y-Axis strategy

- First pinned metric: left Y-axis, colored to match the metric.
- Second pinned metric: right Y-axis, colored to match.
- Third+ pinned metrics: assigned to the left Y-axis (shared). The tooltip provides exact values. This matches Garmin Connect / Strava behavior and avoids axis clutter.

### What it replaces

- The entire "Overlay:" checkbox row in the controls bar is removed.
- The `overlayMetrics` state remains as `Set<string>`, toggle logic stays the same. The only change is where the toggle lives (chart header vs controls bar).
- The `OverlayChart` component stays largely the same but gains unpin buttons in its legend.

## 2. Lap Drill-In: Zoom + Stats Card

### Behavior

- Clicking a lap pill **zooms** all charts to that lap's time range by filtering `chartData` (not `allChartData`) to points within the lap's start/end timestamps. The X-axis rescales to fit the zoomed data.
- Simultaneously, a **stats card** appears between the lap pills and the charts.
- Clicking the same pill again **zooms back out** (toggle, same as current `selectedLap` logic).
- While zoomed in:
  - Lap boundary lines are hidden (irrelevant when viewing a single lap).
  - The selected pill keeps its current blue highlight styling.

### Stats card

A single horizontal card (white bg, rounded-xl, border) with a row of stat cells. Each cell is a compact vertical stack:

```
 [label]
 [value] [unit]
```

Stats to compute from the filtered lap data:

| Stat | Source | Condition |
|------|--------|-----------|
| Duration | `lap.total_elapsed_time` | always |
| Distance | `lap.total_distance` | always |
| Avg HR | `lap.avg_heart_rate` | if present |
| Max HR | `lap.max_heart_rate` | if present |
| Avg Speed | `lap.avg_speed` (convert m/s to km/h) | if present |
| Max Speed | `lap.max_speed` (convert m/s to km/h) | if present |
| Avg Power | `lap.avg_power` | if present |
| Max Power | `lap.max_power` | if present |
| Avg Cadence | `lap.avg_cadence` | if present |
| Elevation Gain | `lap.total_ascent` | if present |

Data comes from the `FitLap` object, not re-computed from records.

### State changes

- Rename: `selectedLap` stays as `number | null`.
- When `selectedLap != null`:
  - `chartData` filters `allChartData` to the selected lap's time range (reintroduce the filtering memo that was removed earlier).
  - `lapBoundaries` returns empty (no lap lines while zoomed).
  - `lapHighlight` is removed (no longer needed since we zoom instead of highlight).
- When `selectedLap == null`:
  - `chartData === allChartData` (no filtering).
  - `lapBoundaries` computed as before.

## 3. Controls bar cleanup

After these changes, the controls bar contains only:
- X-axis mode toggle (time / elapsed / distance)
- Lap lines checkbox

The "Overlay:" section is removed. The bar becomes much simpler.

## Component changes summary

| Component | Change |
|-----------|--------|
| `SingleChart` | Add pin icon button in header. Accept `isPinned` and `onTogglePin` props. Apply `opacity-40` wrapper when pinned. Remove `lapHighlight` prop. |
| `OverlayChart` | Add unpin x-buttons to legend. Remove `lapHighlight` prop. |
| `LapStatsCard` | New component. Renders a horizontal stat row for a selected `FitLap`. |
| `ChartsView` | Remove overlay checkbox row. Reintroduce `chartData` filtering memo for lap zoom. Remove `lapHighlight` memo. Add `LapStatsCard` rendering when `selectedLap != null`. |
| Controls bar | Remove "Overlay:" section. |

## Verification

1. Load a FIT file with multiple laps and metrics.
2. Verify all individual charts render with a pin icon in each header.
3. Pin 2 metrics — overlay chart appears at top with both lines, left/right Y-axes. Individual charts dim.
4. Pin a 3rd metric — it appears on the overlay sharing the left axis.
5. Unpin from the overlay legend x-button — metric removed, individual chart restores opacity.
6. Click a lap pill — all charts zoom to that lap's range, stats card appears with correct values.
7. Click the same pill — zooms back out, stats card disappears.
8. Pin + zoom combined — overlay chart also zooms to the selected lap.
9. X-axis mode changes work correctly in both zoomed and full views.
