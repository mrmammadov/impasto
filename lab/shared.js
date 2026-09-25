// @ts-check
// Helpers shared by the lab pages. Lab pages are throwaway experiments: they import the real
// painter from ../src but nothing in src/ or the build depends on them.
import { paint } from '../src/painter.js';
import { STYLES } from '../src/styles/index.js';
import { PRESETS, DEFAULT_PRESET } from '../src/presets.js';

export const SAMPLE = '../assets/sample.jpg';

/** @param {string} url @returns {Promise<HTMLImageElement>} */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Fill a <select> with the app's presets. @param {HTMLSelectElement} select */
export function fillPresets(select) {
  for (const p of PRESETS) select.add(new Option(p.name, p.id, false, p.id === DEFAULT_PRESET));
}

/**
 * Paint `img` into `canvas` with a preset, exactly as the app would.
 * @param {HTMLImageElement} img @param {HTMLCanvasElement} canvas @param {string} presetId
 * @param {number} longSide @param {(msg: string) => void} status
 */
export async function paintInto(img, canvas, presetId, longSide, status) {
  const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  return paint({
    ctx, image: img, params: p.params, style: STYLES[p.style], seed: 7, longSide,
    onProgress: (_f, msg) => status(msg),
  });
}

/**
 * Call `cb` with an object URL whenever a picture is chosen with the input or dropped on `target`.
 * @param {HTMLInputElement} input @param {HTMLElement} target @param {(url: string) => void} cb
 */
export function onPicture(input, target, cb) {
  input.addEventListener('change', () => { if (input.files?.[0]) cb(URL.createObjectURL(input.files[0])); });
  target.addEventListener('dragover', (e) => e.preventDefault());
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f && f.type.startsWith('image/')) cb(URL.createObjectURL(f));
  });
}

/**
 * Pointer position over `el` as a tilt in [-1, 1]², smoothed; falls back to a slow automatic
 * wobble when the pointer is away so you can watch hands-free. Calls `apply` every frame.
 * @param {HTMLElement} el @param {(x: number, y: number) => void} apply
 */
export function trackTilt(el, apply) {
  let tx = 0, ty = 0, x = 0, y = 0, over = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    over = true;
  });
  el.addEventListener('pointerleave', () => { over = false; });
  const t0 = performance.now();
  const frame = (/** @type {number} */ now) => {
    if (!over) {
      const t = (now - t0) / 1000;
      tx = reduced ? 0 : Math.sin(t * 0.9) * 0.8;
      ty = reduced ? 0 : Math.sin(t * 0.6 + 1) * 0.5;
    }
    x += (Math.max(-1, Math.min(1, tx)) - x) * 0.12;
    y += (Math.max(-1, Math.min(1, ty)) - y) * 0.12;
    apply(x, y);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
