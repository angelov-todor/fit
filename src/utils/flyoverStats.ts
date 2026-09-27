import { formatDuration, MS_TO_KMH } from './fitParser';
import type { Route, RoutePosition } from './flyoverRoute';

export interface Stat {
  label: string;
  value: string;
}

/** Metres as SummaryCards shows them: km to 2 dp from 1 km up, whole metres below. */
function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`;
}

/** The overlay's readouts at `position`. A reading the file doesn't have is left out, not shown as zero. */
export function flyoverStats(position: RoutePosition, route: Route): Stat[] {
  const stats: Stat[] = [
    { label: 'Distance', value: `${formatDistance(position.distance)} / ${formatDistance(route.totalDistance)}` },
  ];
  if (position.elevation !== undefined) {
    stats.push({ label: 'Elevation', value: `${Math.round(position.elevation)} m` });
  }
  if (position.speed !== undefined) {
    stats.push({ label: 'Speed', value: `${(position.speed * MS_TO_KMH).toFixed(1)} km/h` });
  }
  if (position.heartRate !== undefined) {
    stats.push({ label: 'Heart rate', value: `${Math.round(position.heartRate)} bpm` });
  }
  if (route.timed && position.elapsed !== undefined) {
    stats.push({ label: 'Time', value: formatDuration(position.elapsed) });
  }
  return stats;
}
