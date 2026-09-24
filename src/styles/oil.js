// @ts-check
import { gauss, clamp, css, blur, luminance } from '../image-ops.js';

/** @typedef {import('../types.js').BrushStyle} BrushStyle */

/** @type {BrushStyle} */
export const oil = {
  id: 'oil',
  name: 'Oil',

  render(ctx, stroke, { rng, params, flow }) {
    const rad = stroke.radius;
    let P = stroke.points;
    if (P.length === 1) {
      const a = flow(P[0][0], P[0][1]);
      const dx = Math.cos(a) * rad * 0.6, dy = Math.sin(a) * rad * 0.6;
      P = [[P[0][0] - dx, P[0][1] - dy], [P[0][0] + dx, P[0][1] + dy]];
    }
    const n = P.length;
    const normals = P.map((_, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) + 1e-6;
      return [-ty / l, tx / l];
    });

    const width = rad * 1.8;
    const bristles = clamp(Math.floor(rad / 2.2 + 3), 3, 16);
    ctx.lineWidth = Math.max(0.8, (width / bristles) * 1.55);
    const dryTail = 0.05 + 0.5 * params.dry;
    const skip = 0.03 + 0.12 * params.dry;

    // stroke-level colour: slight value and temperature shift, like remixing paint on the brush
    const v = 1 + gauss(rng) * 0.035, warm = gauss(rng) * 0.012;
    const c = stroke.color;
    const base = [c[0] * v + warm, c[1] * v, c[2] * v - warm];

    for (let b = 0; b < bristles; b++) {
      if (rng() < skip) continue;
      const u = (b + 0.5) / bristles - 0.5;
      const off = u * width + gauss(rng) * width * 0.04;
      const edge = Math.abs(u) * 2; // outer bristles are shorter: ragged, rounded ends
      const s0 = rng() * 0.35 * (0.3 + edge);
      const s1 = 1 - rng() * 0.45 * (0.3 + edge);
      const m = Math.max(3, n * 3);
      /** @type {Array<[number, number]>} */
      const Q = [];
      for (let j = 0; j < m; j++) {
        const t = s0 + (s1 - s0) * (j / (m - 1));
        const idx = t * (n - 1);
        const i0 = Math.min(n - 2, Math.max(0, idx | 0));
        const f = idx - i0;
        const x = P[i0][0] * (1 - f) + P[i0 + 1][0] * f, y = P[i0][1] * (1 - f) + P[i0 + 1][1] * f;
        const nx = normals[i0][0] * (1 - f) + normals[i0 + 1][0] * f, ny = normals[i0][1] * (1 - f) + normals[i0 + 1][1] * f;
        Q.push([x + nx * off, y + ny * off]);
      }
      ctx.strokeStyle = css(base, 1 + gauss(rng) * 0.05);

      /** @type {Array<Array<[number, number]>>} */
      let segs = [Q];
      if (rng() < dryTail && Q.length > 6) {
        // dry brush: the tail breaks into dashes
        const cut = Math.floor(Q.length * (0.55 + rng() * 0.3));
        segs = [Q.slice(0, cut)];
        let j = cut;
        while (j < Q.length - 1) {
          const len = 1 + Math.floor(rng() * 3);
          segs.push(Q.slice(j, j + len + 1));
          j += len + 1 + Math.floor(rng() * 2);
        }
      }
      for (const s of segs) {
        if (s.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(s[0][0], s[0][1]);
        for (let q = 1; q < s.length; q++) ctx.lineTo(s[q][0], s[q][1]);
        ctx.stroke();
      }
    }
  },

  finish(ctx, W, H, rng) {
    surface(ctx, W, H, rng, { weave: 0.012, grain: 0.04, sheen: 0.1 });
  },
};

/**
 * Canvas weave, grain and a faint raised-paint sheen. Shared by styles.
 * @param {CanvasRenderingContext2D} ctx @param {number} W @param {number} H @param {() => number} rng
 * @param {{weave: number, grain: number, sheen: number}} amount
 */
export function surface(ctx, W, H, rng, amount) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const Lb = blur(luminance(d, W * H), W, H, 1);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const emb = (Lb[i + W] - Lb[i - W]) * amount.sheen * 255;
      const mul = 1 + Math.sin(x * 1.9) * Math.sin(y * 1.9) * amount.weave + (rng() - 0.5) * amount.grain;
      for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = clamp(d[i * 4 + ch] * mul + emb, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}
