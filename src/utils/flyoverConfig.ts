/**
 * The MapTiler key baked in at build time, or undefined when it isn't set.
 * Read inside the function rather than at module load, so tests can stub it.
 */
export function mapTilerKey(): string | undefined {
  const key: unknown = import.meta.env.VITE_MAPTILER_KEY;
  if (typeof key !== 'string') return undefined;
  const trimmed = key.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** The MapTiler failures a user can act on, each with its own banner. */
export type MapTilerErrorKind = 'key' | 'quota';

/** Which actionable MapTiler failure a map error is, if any. Anything else is only logged. */
export function mapTilerErrorKind(error: unknown): MapTilerErrorKind | undefined {
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
  if (status === 401 || status === 403) return 'key';
  if (status === 429) return 'quota';
  return undefined;
}
