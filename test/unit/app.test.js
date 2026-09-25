import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outputSize } from '../../src/painter.js';
import { withHeight } from '../../src/height.js';
import { PRESETS, DEFAULT_PRESET } from '../../src/presets.js';
import { STYLES } from '../../src/styles/index.js';

test('outputSize: long side matches, aspect ratio is kept', () => {
  assert.deepEqual(outputSize({ naturalWidth: 4000, naturalHeight: 3000 }, 1600), { W: 1600, H: 1200 });
  assert.deepEqual(outputSize({ naturalWidth: 3000, naturalHeight: 4000 }, 1600), { W: 1200, H: 1600 });
});

test('outputSize: tiny or extreme pictures never go below 64 px', () => {
  assert.deepEqual(outputSize({ naturalWidth: 10000, naturalHeight: 100 }, 1200), { W: 1200, H: 64 });
});

test('presets: every preset uses a registered style and in-range values', () => {
  const ranges = { size: [0.5, 2], detail: [0, 1], length: [0.4, 2], dry: [0, 1], sharp: [0, 0.4] };
  assert.ok(
    PRESETS.some((p) => p.id === DEFAULT_PRESET),
    'default preset exists',
  );
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length, 'ids are unique');
  for (const p of PRESETS) {
    assert.ok(STYLES[p.style], `${p.id}: style "${p.style}" is registered`);
    for (const [key, [lo, hi]] of Object.entries(ranges)) {
      const v = p.params[key];
      assert.ok(v >= lo && v <= hi, `${p.id}.${key} = ${v} is within ${lo}–${hi}`);
    }
  }
});

/** A stand-in 2D context that records what was done to it. */
function recorder() {
  const calls = [];
  const ctx = {
    calls,
    canvas: { width: 10 },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalCompositeOperation: '',
  };
  for (const m of ['fillRect', 'stroke', 'beginPath', 'moveTo', 'lineTo', 'getImageData', 'putImageData']) {
    ctx[m] = (...args) => {
      calls.push([m, ...args]);
      return m === 'getImageData' ? { data: 'pixels' } : undefined;
    };
  }
  return ctx;
}

test('withHeight: drawing is mirrored onto the height canvas, except the ground', () => {
  const colour = recorder(),
    height = recorder();
  const ctx = withHeight(colour, height);
  ctx.fillStyle = '#123';
  ctx.fillRect(0, 0, 10, 10); // the ground
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1, 1);
  ctx.lineTo(5, 5);
  ctx.stroke();

  assert.equal(colour.fillStyle, '#123');
  assert.equal(colour.strokeStyle, 'red');
  assert.deepEqual(
    colour.calls.map((c) => c[0]),
    ['fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke'],
  );
  assert.deepEqual(
    height.calls.map((c) => c[0]),
    ['beginPath', 'moveTo', 'lineTo', 'stroke'],
  );
  assert.equal(height.strokeStyle, 'rgb(3,3,3)', 'height gets a fixed thickness, not the colour');
  assert.equal(height.lineWidth, 3, 'geometry settings are copied');
  assert.equal(height.globalCompositeOperation, 'lighter', 'overlapping paint piles up');
});

test('withHeight: pixel reads and writes touch only the colour canvas', () => {
  const colour = recorder(),
    height = recorder();
  const ctx = withHeight(colour, height);
  assert.deepEqual(ctx.getImageData(0, 0, 1, 1), { data: 'pixels' });
  ctx.putImageData({}, 0, 0);
  assert.deepEqual(height.calls, []);
  assert.equal(ctx.canvas, colour.canvas);
});
