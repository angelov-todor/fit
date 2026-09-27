import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { FitRecord } from '../types/fit';

// Lazy, so maplibre-gl (~270 kB gzipped) loads only when someone opens the tab.
const FlyoverView = lazy(() => import('./FlyoverView'));

const CARD =
  'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center text-sm text-slate-400';

interface BoundaryState {
  failed: boolean;
}

/** Catches a chunk that fails to load, or a map that throws while starting up. */
class FlyoverBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <div className={CARD}>Couldn't load the 3D view. Check your connection and reload.</div>;
    }
    return this.props.children;
  }
}

export default function FlyoverTab({ records }: { records: FitRecord[] }) {
  return (
    <FlyoverBoundary>
      <Suspense fallback={<div className={CARD}>Loading 3D view…</div>}>
        <FlyoverView records={records} />
      </Suspense>
    </FlyoverBoundary>
  );
}
