/**
 * Whether this browser can give MapLibre the WebGL2 context it needs. MapLibre 6
 * asks only for 'webgl2' and has no WebGL1 fallback, so offering WebGL1 alone is
 * not enough. The probe's
 * context is released at once: browsers cap live WebGL contexts, and a probe that
 * held on to one would count against the cap.
 */
export function canRenderMap(createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')): boolean {
  try {
    const canvas = createCanvas();
    const gl = canvas.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}
