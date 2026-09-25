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
