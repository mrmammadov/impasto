// @ts-check
// The painter decides WHERE strokes go and WHICH colour they carry.
// How a stroke looks is left to the style (see src/styles/).
import { mulberry32, blur, sobel, nextFrame } from './image-ops.js';

/** @typedef {import('./types.js').PaintJob} PaintJob */
/** @typedef {import('./types.js').PaintResult} PaintResult */
/** @typedef {import('./types.js').BrushParams} BrushParams */

/**
 * The coarse-to-fine layer plan. Radii are for a 2400 px canvas; they are scaled to the real size.
 * @param {BrushParams} p
 * @param {boolean} withFocus
 */
function layerPlan(p, withFocus) {
  const plan = [
    { r: 46 * p.size, t: 0.0, len: 12, focus: false },
    { r: 26 * p.size, t: 0.06, len: 14, focus: false },
  ];
  if (p.detail >= 0.3) plan.push({ r: 14 * p.size, t: 0.11 - 0.03 * p.detail, len: 14, focus: false });
  if (p.detail >= 0.7) plan.push({ r: 8 * p.size, t: 0.1, len: 12, focus: false });
  if (withFocus) {
    plan.push({ r: 8, t: 0.06, len: 12, focus: true });
    plan.push({ r: 4, t: 0.05, len: 10, focus: true });
  }
  return plan;
}

/**
 * Paint `job.image` onto `job.ctx`. Returns null if cancelled part-way.
 * @param {PaintJob} job
 * @returns {Promise<PaintResult | null>}
 */
export async function paint(job) {
  const { ctx, image, params, style, seed, longSide, focusPoint } = job;
  const onProgress = job.onProgress || (() => {});
  const cancelled = job.isCancelled || (() => false);
  const t0 = performance.now();
  const rng = mulberry32(seed);

  // --- read the picture at working size
  const scale = longSide / Math.max(image.naturalWidth, image.naturalHeight);
  const W = Math.max(64, Math.round(image.naturalWidth * scale));
  const H = Math.max(64, Math.round(image.naturalHeight * scale));
  const N = W * H;
  const k = Math.max(W, H) / 2400;
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const octx = /** @type {CanvasRenderingContext2D} */ (off.getContext('2d', { willReadFrequently: true }));
  octx.drawImage(image, 0, 0, W, H);
  const px = octx.getImageData(0, 0, W, H).data;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), L = new Float32Array(N);
  /** @type {[number, number, number]} */
  const avg = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    R[i] = px[i * 4] / 255; G[i] = px[i * 4 + 1] / 255; B[i] = px[i * 4 + 2] / 255;
    L[i] = 0.3 * R[i] + 0.59 * G[i] + 0.11 * B[i];
    avg[0] += R[i]; avg[1] += G[i]; avg[2] += B[i];
  }
  avg[0] /= N; avg[1] /= N; avg[2] /= N;

  // --- prepare the canvas with a toned ground
  const canvas = ctx.canvas;
  canvas.width = W;
  canvas.height = H;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = style.ground
    ? style.ground(avg)
    : `rgb(${Math.round(avg[0] * 90)},${Math.round(avg[1] * 90)},${Math.round(avg[2] * 100 + 12)})`;
  ctx.fillRect(0, 0, W, H);

  // --- where the small brush may work
  const focus = params.sharp > 0 ? focusMask(L, W, H, k, params.sharp, focusPoint, rng) : null;

  const flowK = Math.max(k, 0.2);
  /** @param {number} x @param {number} y */
  const flow = (x, y) => 0.25 * Math.sin(x / (210 * flowK) + y / (330 * flowK)) + 0.15 * Math.sin(y / (90 * flowK));
  const env = { rng, params, flow };

  const plan = layerPlan(params, !!focus);
  let total = 0;
  for (let li = 0; li < plan.length; li++) {
    const P = plan[li];
    const rad = Math.max(1.5, P.r * k);
    const maxLen = Math.max(2, Math.round(P.len * params.length));
    if (cancelled()) return null;
    onProgress(li / plan.length, `Painting layer ${li + 1} of ${plan.length}…`);
    await nextFrame();

    // reference: the picture blurred to this brush's scale
    const sig = rad * 0.5;
    const rr = blur(R, W, H, sig), rg = blur(G, W, H, sig), rb = blur(B, W, H, sig);
    const [gx, gy] = sobel(blur(L, W, H, sig), W, H);
    const cur = ctx.getImageData(0, 0, W, H).data;

    // one stroke per grid cell where the painting still differs enough from the picture
    const g = Math.max(2, Math.round(rad));
    /** @type {number[]} */
    const cells = [];
    for (let cy = 0; cy + g <= H; cy += g) {
      for (let cx = 0; cx + g <= W; cx += g) {
        let sum = 0, best = -1, bi = 0;
        for (let y = cy; y < cy + g; y++) {
          let i = y * W + cx;
          for (let x = 0; x < g; x++, i++) {
            const dr = rr[i] - cur[i * 4] / 255, dg = rg[i] - cur[i * 4 + 1] / 255, db = rb[i] - cur[i * 4 + 2] / 255;
            const e = Math.sqrt(dr * dr + dg * dg + db * db);
            sum += e;
            if (e > best) { best = e; bi = i; }
          }
        }
        if (sum / (g * g) > P.t && (!P.focus || (focus && focus[bi]))) cells.push(bi);
      }
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    let frameStart = performance.now();
    for (let ci = 0; ci < cells.length; ci++) {
      const i0 = cells[ci];
      /** @type {[number, number, number]} */
      const color = [rr[i0], rg[i0], rb[i0]];
      const points = strokePath(i0 % W, (i0 / W) | 0, rad, maxLen, color, rr, rg, rb, cur, gx, gy, W, H, flow);
      style.render(ctx, { points, color, radius: rad }, env);
      if ((ci & 63) === 0 && performance.now() - frameStart > 14) {
        onProgress((li + ci / cells.length) / plan.length, `Painting layer ${li + 1} of ${plan.length}…`);
        await nextFrame();
        if (cancelled()) return null;
        frameStart = performance.now();
      }
    }
    total += cells.length;
  }

  if (style.finish) style.finish(ctx, W, H, rng);
  onProgress(1, 'Done');
  return { strokes: total, seconds: (performance.now() - t0) / 1000 };
}

/**
 * Grow a stroke along the forms: perpendicular to the colour gradient, stopping when
 * continuing would make the painting worse (Hertzmann-style).
 * @returns {Array<[number, number]>}
 */
function strokePath(x0, y0, rad, maxLen, c, rr, rg, rb, cur, gx, gy, W, H, flow) {
  /** @type {Array<[number, number]>} */
  const pts = [[x0, y0]];
  let x = x0, y = y0, ldx = 0, ldy = 0;
  for (let i = 0; i < maxLen; i++) {
    const i1 = (y | 0) * W + (x | 0);
    if (i > 1) {
      const dr = rr[i1] - cur[i1 * 4] / 255, dg = rg[i1] - cur[i1 * 4 + 1] / 255, db = rb[i1] - cur[i1 * 4 + 2] / 255;
      const er = rr[i1] - c[0], eg = rg[i1] - c[1], eb = rb[i1] - c[2];
      if (dr * dr + dg * dg + db * db < er * er + eg * eg + eb * eb) break;
    }
    const gxv = gx[i1], gyv = gy[i1];
    const mag = Math.hypot(gxv, gyv);
    let dx, dy;
    if (mag < 0.004) {
      const a = flow(x, y);
      dx = Math.cos(a); dy = Math.sin(a);
    } else {
      dx = -gyv / mag; dy = gxv / mag;
    }
    if (ldx * dx + ldy * dy < 0) { dx = -dx; dy = -dy; }
    if (i > 0) {
      dx = 0.6 * dx + 0.4 * ldx; dy = 0.6 * dy + 0.4 * ldy;
      const n = Math.hypot(dx, dy) + 1e-6;
      dx /= n; dy /= n;
    }
    const nx = x + rad * dx, ny = y + rad * dy;
    if (nx < 1 || nx >= W - 1 || ny < 1 || ny >= H - 1) break;
    x = nx; y = ny;
    pts.push([x, y]);
    ldx = dx; ldy = dy;
  }
  return pts;
}

/**
 * Pixels the small brush may touch: a circle around the chosen point, or the busiest
 * `sharp` fraction of the picture when no point is chosen.
 */
function focusMask(L, W, H, k, sharp, focusPoint, rng) {
  const N = W * H;
  const mask = new Uint8Array(N);
  if (focusPoint) {
    const fx = focusPoint.x * W, fy = focusPoint.y * H;
    const r2 = (sharp * N) / Math.PI;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if ((x - fx) ** 2 + (y - fy) ** 2 < r2) mask[y * W + x] = 1;
    }
    return mask;
  }
  const [sx, sy] = sobel(blur(L, W, H, Math.max(2, 4 * k)), W, H);
  const mag = new Float32Array(N);
  for (let i = 0; i < N; i++) mag[i] = Math.hypot(sx[i], sy[i]);
  const sal = blur(mag, W, H, Math.max(8, 40 * k));
  const sample = [];
  for (let i = 0; i < 20000; i++) sample.push(sal[(rng() * N) | 0]);
  sample.sort((a, b) => a - b);
  const thr = sample[Math.floor((1 - sharp) * (sample.length - 1))];
  for (let i = 0; i < N; i++) if (sal[i] >= thr) mask[i] = 1;
  return mask;
}

/** Pixel radius of the focus ring for a given sharp fraction, as a share of canvas width. */
export function focusRingWidth(sharp, W, H) {
  return (2 * Math.sqrt((sharp * W * H) / Math.PI)) / W;
}
