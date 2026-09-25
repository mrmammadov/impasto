// @ts-check
// Paint thickness. While the painter works, every mark is repeated in grey on a hidden height
// canvas, so the viewer can light the paint's ridges and grooves. Works for any style unchanged.
import { blur } from './image-ops.js';

// pixel reads and writes (the painter's error check, a style's finishing pass) are colour-only
const COLOUR_ONLY = new Set(['getImageData', 'putImageData', 'createImageData']);

/**
 * A stand-in for the painter's context: every call goes to `ctx`, and drawing calls are repeated
 * on `hctx`, where each mark adds a little thickness ('lighter', so overlapping paint piles up).
 * The first fillRect is the ground and adds none.
 * @param {CanvasRenderingContext2D} ctx @param {CanvasRenderingContext2D} hctx
 * @returns {CanvasRenderingContext2D}
 */
export function withHeight(ctx, hctx) {
  hctx.globalCompositeOperation = 'lighter';
  let ground = true;
  return new Proxy(ctx, {
    get(target, key) {
      const v = target[key];
      if (typeof v !== 'function') return v;
      if (COLOUR_ONLY.has(/** @type {string} */ (key))) return v.bind(target);
      return (...args) => {
        const r = v.apply(target, args);
        if (key === 'fillRect' && ground) {
          ground = false;
          return r;
        }
        hctx[key](...args);
        return r;
      };
    },
    set(target, key, value) {
      target[key] = value;
      if (key === 'fillStyle') {
        hctx.fillStyle = 'rgb(6,6,6)'; // a slab of paint
      } else if (key === 'strokeStyle') {
        hctx.strokeStyle = 'rgb(3,3,3)'; // one bristle's line
      } else if (key !== 'globalCompositeOperation') {
        hctx[key] = value;
      }
      return true;
    },
  });
}

/**
 * Keep only the texture of the paint: soften pixel steps, subtract a blurred copy (the broad piles
 * of many layers) and normalise, so every area has similar relief whether it got two strokes or
 * twenty. Returns one byte per pixel, 128 = average height.
 * @param {HTMLCanvasElement} c @returns {Uint8Array}
 */
export function paintTexture(c) {
  const W = c.width,
    H = c.height,
    N = W * H;
  const d = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).getImageData(0, 0, W, H).data;
  let h = new Float32Array(N);
  for (let i = 0; i < N; i++) h[i] = d[i * 4];
  h = blur(h, W, H, 0.8);
  const broad = blur(h, W, H, Math.max(3, (6 * Math.max(W, H)) / 1200));
  let sq = 0;
  for (let i = 0; i < N; i++) {
    h[i] -= broad[i];
    sq += h[i] * h[i];
  }
  const sd = Math.sqrt(sq / N) || 1;
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = Math.max(0, Math.min(255, 128 + (h[i] / sd) * 42));
  return out;
}
