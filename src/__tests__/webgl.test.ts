import { describe, it, expect, vi } from 'vitest';
import { canRenderMap } from '../utils/webgl';

/** A canvas that offers only the listed context types. */
function canvasOffering(...types: string[]) {
  const loseContext = vi.fn();
  const context = { getExtension: () => ({ loseContext }) };
  const canvas = { getContext: (type: string) => (types.includes(type) ? context : null) };
  return { canvas: canvas as unknown as HTMLCanvasElement, loseContext };
}

describe('canRenderMap', () => {
  it('is true when the browser offers WebGL2, and releases the probe context', () => {
    const { canvas, loseContext } = canvasOffering('webgl2', 'webgl');
    expect(canRenderMap(() => canvas)).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('is false for a WebGL1-only browser, because MapLibre 6 requires WebGL2', () => {
    const { canvas } = canvasOffering('webgl');
    expect(canRenderMap(() => canvas)).toBe(false);
  });

  it('is false when creating the context throws', () => {
    const canvas = { getContext: () => { throw new Error('blocked'); } } as unknown as HTMLCanvasElement;
    expect(canRenderMap(() => canvas)).toBe(false);
  });
});
