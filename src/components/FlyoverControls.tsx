import { Pause, Play, RotateCcw } from 'lucide-react';
import { SPEEDS, type Speed } from '../utils/flyoverPlayback';
import type { Stat } from '../utils/flyoverStats';

const SCRUB_STEPS = 1000;

/** The readouts, floating over the top-left of the map. */
export function FlyoverStatsPanel({ stats }: { stats: Stat[] }) {
  return (
    <dl className="absolute top-3 left-3 z-10 rounded-lg bg-slate-900/70 text-white text-xs px-3 py-2 space-y-0.5 pointer-events-none">
      {stats.map(s => (
        <div key={s.label} className="flex gap-3 justify-between">
          <dt className="text-slate-300">{s.label}</dt>
          <dd className="font-semibold tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface Props {
  playing: boolean;
  progress: number;
  speed: Speed;
  onTogglePlay: () => void;
  onRestart: () => void;
  onScrub: (progress: number) => void;
  onSpeed: (speed: Speed) => void;
}

const iconButton =
  'p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors';

export default function FlyoverControls({ playing, progress, speed, onTogglePlay, onRestart, onScrub, onSpeed }: Props) {
  const playLabel = playing ? 'Pause' : 'Play';
  return (
    <div className="p-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
      <button onClick={onTogglePlay} className={iconButton} title={playLabel} aria-label={playLabel}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>
      <button onClick={onRestart} className={iconButton} title="Restart" aria-label="Restart">
        <RotateCcw className="w-4 h-4" />
      </button>
      <input
        type="range"
        min={0}
        max={SCRUB_STEPS}
        value={Math.round(progress * SCRUB_STEPS)}
        onChange={e => onScrub(Number(e.target.value) / SCRUB_STEPS)}
        className="flex-1 min-w-32 accent-blue-600"
        aria-label="Flyover position"
      />
      <div className="flex gap-1" role="group" aria-label="Playback speed">
        {SPEEDS.map(s => (
          <button
            key={s}
            onClick={() => onSpeed(s)}
            aria-pressed={s === speed}
            className={`px-2 py-1 rounded-md font-medium tabular-nums transition-colors ${
              s === speed
                ? 'bg-blue-600 text-white'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
