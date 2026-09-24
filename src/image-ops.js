// @ts-check
// Small, dependency-free image helpers used by the painter and the styles.

/** Seeded random numbers in [0, 1). Same seed, same painting. */
export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normally distributed random number (mean 0, sd 1). @param {() => number} rng */
export function gauss(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Resolves on the next animation frame, so long jobs can show progress. */
export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

/** Box sizes whose three passes approximate a Gaussian of the given sigma. */
function boxesForGauss(sigma, n) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

/** @param {Float32Array} src @param {Float32Array} dst @param {number} w @param {number} h @param {number} r */
function boxH(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + clamp(k, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * inv;
      acc += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
    }
  }
}

/** @param {Float32Array} src @param {Float32Array} dst @param {number} w @param {number} h @param {number} r */
function boxV(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[clamp(k, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      acc += src[Math.min(y + r + 1, h - 1) * w + x] - src[Math.max(y - r, 0) * w + x];
    }
  }
}

/**
 * Fast approximate Gaussian blur of one channel (three box passes). Returns a new array.
 * @param {Float32Array} ch @param {number} w @param {number} h @param {number} sigma
 */
export function blur(ch, w, h, sigma) {
  const a = Float32Array.from(ch);
  if (sigma < 0.6) return a;
  const b = new Float32Array(a.length);
  for (const size of boxesForGauss(sigma, 3)) {
    const r = Math.max(0, (size - 1) >> 1);
    boxH(a, b, w, h, r);
    boxV(b, a, w, h, r);
  }
  return a;
}

/**
 * Sobel gradients of one channel.
 * @param {Float32Array} L @param {number} w @param {number} h
 * @returns {[Float32Array, Float32Array]}
 */
export function sobel(L, w, h) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = L[i - w - 1], b = L[i - w], c = L[i - w + 1];
      const d = L[i - 1], f = L[i + 1];
      const g = L[i + w - 1], hh = L[i + w], k = L[i + w + 1];
      gx[i] = c + 2 * f + k - (a + 2 * d + g);
      gy[i] = g + 2 * hh + k - (a + 2 * b + c);
    }
  }
  return [gx, gy];
}

/**
 * Luminance of an RGBA byte buffer, 0–1.
 * @param {Uint8ClampedArray} rgba @param {number} n
 */
export function luminance(rgba, n) {
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = (0.3 * rgba[i * 4] + 0.59 * rgba[i * 4 + 1] + 0.11 * rgba[i * 4 + 2]) / 255;
  return L;
}

/** @param {number[]} rgb 0–1 @param {number} [jitter] multiplier */
export function css(rgb, jitter = 1) {
  const c = (v) => Math.round(clamp(v * jitter, 0, 1) * 255);
  return `rgb(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])})`;
}
