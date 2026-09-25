// @ts-check
import { gauss, css } from '../image-ops.js';
import { surface } from './oil.js';

/** @typedef {import('../types.js').BrushStyle} BrushStyle */

/**
 * Palette knife: each stroke is a flat slab of paint with square ends, a light ridge where
 * paint piles up along one edge, a thin shadow on the other, and scraped streaks at the tail.
 * @type {BrushStyle}
 */
export const knife = {
  id: 'knife',
  name: 'Palette knife',

  render(ctx, stroke, { rng, params, flow }) {
    const rad = stroke.radius;
    let P = stroke.points;
    if (P.length === 1) {
      const a = flow(P[0][0], P[0][1]);
      const dx = Math.cos(a) * rad * 0.7,
        dy = Math.sin(a) * rad * 0.7;
      P = [
        [P[0][0] - dx, P[0][1] - dy],
        [P[0][0] + dx, P[0][1] + dy],
      ];
    }
    // knives make straighter marks: keep start, middle and end only
    if (P.length > 3) P = [P[0], P[(P.length / 2) | 0], P[P.length - 1]];
    const n = P.length;
    const normals = P.map((_, i) => {
      const a = P[Math.max(0, i - 1)],
        b = P[Math.min(n - 1, i + 1)];
      const tx = b[0] - a[0],
        ty = b[1] - a[1],
        l = Math.hypot(tx, ty) + 1e-6;
      return [-ty / l, tx / l];
    });
    const half = rad * 0.85 * (0.85 + rng() * 0.3);
    const left = P.map((p, i) => [p[0] + normals[i][0] * half, p[1] + normals[i][1] * half]);
    const right = P.map((p, i) => [
      p[0] - normals[i][0] * half * (0.8 + 0.2 * (i / (n - 1))),
      p[1] - normals[i][1] * half * (0.8 + 0.2 * (i / (n - 1))),
    ]);

    const v = 1 + gauss(rng) * 0.03,
      warm = gauss(rng) * 0.01;
    const c = stroke.color;
    const base = [c[0] * v + warm, c[1] * v, c[2] * v - warm];

    // the slab
    ctx.fillStyle = css(base);
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const p of left.slice(1)) ctx.lineTo(p[0], p[1]);
    for (const p of right.slice().reverse()) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();

    // ridge and shadow along the edges
    const edge = (pts, colour, w) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    };
    edge(left, css(base, 1.14), Math.max(1, rad * 0.12));
    edge(right, css(base, 0.84), Math.max(0.8, rad * 0.07));

    // scraped tail: thin streaks where the paint thins out
    if (rng() < 0.2 + 0.6 * params.dry && n >= 2) {
      const a = P[n - 2],
        b = P[n - 1];
      const streaks = 2 + Math.floor(rng() * 4);
      for (let s = 0; s < streaks; s++) {
        const off = (rng() - 0.5) * half * 1.6;
        const t0 = 0.3 + rng() * 0.4;
        const nx = normals[n - 1][0],
          ny = normals[n - 1][1];
        const x0 = a[0] + (b[0] - a[0]) * t0 + nx * off,
          y0 = a[1] + (b[1] - a[1]) * t0 + ny * off;
        const x1 = b[0] + nx * off,
          y1 = b[1] + ny * off;
        ctx.strokeStyle = css(base, rng() < 0.5 ? 0.78 : 1.18);
        ctx.lineWidth = Math.max(0.6, rad * 0.05);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
  },

  finish(ctx, W, H, rng) {
    surface(ctx, W, H, rng, { weave: 0.006, grain: 0.03, sheen: 0.18 });
  },
};
