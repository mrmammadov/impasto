import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, gauss, clamp, blur, sobel, luminance, css } from '../../src/image-ops.js';

test('mulberry32: same seed gives the same sequence, in [0, 1)', () => {
  const a = mulberry32(42),
    b = mulberry32(42),
    c = mulberry32(43);
  const sa = Array.from({ length: 100 }, a);
  assert.deepEqual(sa, Array.from({ length: 100 }, b));
  assert.notDeepEqual(sa, Array.from({ length: 100 }, c));
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

test('gauss: roughly mean 0, standard deviation 1', () => {
  const rng = mulberry32(1);
  const xs = Array.from({ length: 20000 }, () => gauss(rng));
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean) < 0.03, `mean ${mean}`);
  assert.ok(Math.abs(sd - 1) < 0.03, `sd ${sd}`);
});

test('clamp', () => {
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(2, 0, 1), 1);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test('blur: keeps a flat image flat and returns a new array', () => {
  const src = new Float32Array(20 * 10).fill(0.7);
  const out = blur(src, 20, 10, 3);
  assert.notEqual(out, src);
  assert.ok(out.every((v) => Math.abs(v - 0.7) < 1e-5));
});

test('blur: spreads a single bright pixel but keeps its total', () => {
  const W = 31,
    H = 31;
  const src = new Float32Array(W * H);
  src[15 * W + 15] = 1;
  const out = blur(src, W, H, 2);
  const total = out.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(total - 1) < 1e-3, `total ${total}`);
  assert.ok(out[15 * W + 15] < 1 && out[15 * W + 16] > 0);
});

test('sobel: a left-to-right ramp has a positive x gradient and no y gradient', () => {
  const W = 8,
    H = 8;
  const L = new Float32Array(W * H).map((_, i) => (i % W) / W);
  const [gx, gy] = sobel(L, W, H);
  const i = 4 * W + 4;
  assert.ok(gx[i] > 0);
  assert.equal(gy[i], 0);
});

test('luminance: white is 1, black is 0', () => {
  const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  const L = luminance(rgba, 2);
  assert.ok(Math.abs(L[0] - 1) < 1e-6);
  assert.equal(L[1], 0);
});

test('css: formats and clamps a colour', () => {
  assert.equal(css([1, 0.5, 0]), 'rgb(255,128,0)');
  assert.equal(css([1, 1, 1], 2), 'rgb(255,255,255)');
});
