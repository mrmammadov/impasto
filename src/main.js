// @ts-check
// UI wiring only. Painting lives in painter.js, looks live in styles/, choices in presets.js.
import { paint, focusRingWidth } from './painter.js';
import { STYLES } from './styles/index.js';
import { PRESETS, DEFAULT_PRESET } from './presets.js';

/** @typedef {import('./types.js').BrushParams} BrushParams */

/** @param {string} id @returns {any} */
const $ = (id) => document.getElementById(id);

const canvas = /** @type {HTMLCanvasElement} */ ($('paint'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
const statusEl = $('status'), barEl = $('bar'), ring = $('ring'), originalEl = $('original');

/** @type {HTMLImageElement | null} */
let image = null;
let seed = 7;
let job = 0;
/** @type {{x: number, y: number} | null} */
let focusPoint = null;
let presetId = DEFAULT_PRESET;
let customised = false;
/** @type {any} */
let downloads = null;

// ---------- sliders
/** @type {Record<keyof BrushParams, [HTMLInputElement, HTMLOutputElement, (v: number) => string]>} */
const sliders = {
  size: [$('size'), $('sizeOut'), (v) => `${Math.round(v * 100)}%`],
  detail: [$('detail'), $('detailOut'), (v) => (v < 0.3 ? 'Loose' : v < 0.7 ? 'Medium' : 'Fine')],
  length: [$('length'), $('lengthOut'), (v) => `${Math.round(v * 100)}%`],
  dry: [$('dry'), $('dryOut'), (v) => `${Math.round(v * 100)}%`],
  sharp: [$('sharp'), $('sharpOut'), (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}% of picture`)],
};

/** @returns {BrushParams} */
function readParams() {
  const p = /** @type {BrushParams} */ ({});
  for (const key of /** @type {(keyof BrushParams)[]} */ (Object.keys(sliders))) {
    const [input, out, fmt] = sliders[key];
    p[key] = parseFloat(input.value);
    out.textContent = fmt(p[key]);
  }
  return p;
}

/** @param {BrushParams} params */
function writeParams(params) {
  for (const key of /** @type {(keyof BrushParams)[]} */ (Object.keys(sliders))) sliders[key][0].value = String(params[key]);
  readParams();
}

// ---------- presets
const presetList = $('presets');
function renderPresets() {
  presetList.innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(p.id === presetId));
    b.textContent = p.name;
    b.addEventListener('click', () => selectPreset(p.id));
    presetList.appendChild(b);
  }
  const current = PRESETS.find((p) => p.id === presetId);
  $('presetNote').textContent = current
    ? customised ? `Custom, based on ${current.name}.` : current.description
    : '';
}
/** @param {string} id */
function selectPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  presetId = id;
  customised = false;
  writeParams(p.params);
  renderPresets();
  updateFocusUi();
  run();
}
function currentStyle() {
  const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
  return STYLES[p.style] || Object.values(STYLES)[0];
}

// ---------- painting
async function run() {
  if (!image) return;
  const my = ++job;
  const result = await paint({
    ctx,
    image,
    params: readParams(),
    style: currentStyle(),
    seed,
    longSide: parseInt($('quality').value, 10),
    focusPoint,
    onProgress: (f, msg) => {
      if (my !== job) return;
      barEl.style.width = `${Math.round(f * 100)}%`;
      statusEl.textContent = msg;
    },
    isCancelled: () => my !== job,
  });
  if (result && my === job) {
    statusEl.textContent = `${result.strokes.toLocaleString()} strokes in ${result.seconds.toFixed(1)} s. Tap the painting to move the small brush.`;
    updateFocusUi();
  }
}

// ---------- pictures
/** @param {string} url */
function loadSrc(url) {
  const img = new Image();
  img.onload = () => {
    image = img;
    originalEl.src = url;
    focusPoint = null;
    updateFocusUi();
    run();
  };
  img.onerror = () => { statusEl.textContent = 'That file could not be opened as a picture. Try a JPEG or PNG.'; };
  img.src = url;
}
/** @param {File | undefined} file */
function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    statusEl.textContent = 'That file is not a picture. Choose a JPEG, PNG or WebP.';
    return;
  }
  const fr = new FileReader();
  fr.onload = () => loadSrc(String(fr.result));
  fr.readAsDataURL(file);
}
$('file').addEventListener('change', (e) => loadFile(e.target.files[0]));
const stage = $('stage');
stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragging'); });
stage.addEventListener('dragleave', () => stage.classList.remove('dragging'));
stage.addEventListener('drop', (e) => {
  e.preventDefault();
  stage.classList.remove('dragging');
  loadFile(e.dataTransfer.files[0]);
});

// ---------- small-brush focus
function updateFocusUi() {
  const sharp = parseFloat(sliders.sharp[0].value);
  if (focusPoint && sharp > 0) {
    ring.style.display = 'block';
    ring.style.left = `${focusPoint.x * 100}%`;
    ring.style.top = `${focusPoint.y * 100}%`;
    ring.style.width = `${focusRingWidth(sharp, canvas.width, canvas.height) * 100}%`;
    $('focusHint').textContent = 'The small brush works inside the ring. Tap elsewhere to move it.';
    $('autoFocus').hidden = false;
  } else {
    ring.style.display = 'none';
    $('focusHint').textContent = 'Placed automatically on the busiest part of the picture. Tap the painting to choose the spot yourself.';
    $('autoFocus').hidden = !focusPoint;
  }
}
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  focusPoint = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  if (parseFloat(sliders.sharp[0].value) === 0) sliders.sharp[0].value = '0.12';
  updateFocusUi();
  run();
});
$('autoFocus').addEventListener('click', () => { focusPoint = null; updateFocusUi(); run(); });

// ---------- controls
for (const key of /** @type {(keyof BrushParams)[]} */ (Object.keys(sliders))) {
  const input = sliders[key][0];
  input.addEventListener('input', () => { readParams(); if (key === 'sharp') updateFocusUi(); });
  input.addEventListener('change', () => { customised = true; renderPresets(); run(); });
}
$('quality').addEventListener('change', run);
$('reseed').addEventListener('click', () => { seed = (seed * 16807 + 11) % 2147483647; run(); });

const cmp = $('compare');
/** @param {boolean} on */
const showOriginal = (on) => originalEl.classList.toggle('show', on);
cmp.addEventListener('pointerdown', () => showOriginal(true));
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) cmp.addEventListener(ev, () => showOriginal(false));
cmp.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') showOriginal(true); });
cmp.addEventListener('keyup', () => showOriginal(false));

// ---------- saving: claude.ai's download capability when available, a normal download otherwise
$('save').addEventListener('click', () => {
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const filename = `loose-brush-${presetId}.png`;
    if (!downloads) {
      const a = document.createElement('a');
      a.download = filename;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      return;
    }
    try {
      await downloads.save({ filename, data: blob });
      statusEl.textContent = 'Saved.';
    } catch (err) {
      const code = err && err.code;
      if (code === 'declined') statusEl.textContent = 'Save cancelled.';
      else if (code === 'rate_limited') statusEl.textContent = 'A save is already waiting for your answer.';
      else { statusEl.textContent = 'Saving is not available here.'; $('save').hidden = true; }
    }
  }, 'image/png');
});
(async () => {
  for (let tries = 0; tries < 40; tries++) {
    const claude = /** @type {any} */ (window).claude;
    if (claude && typeof claude.use === 'function') {
      try {
        downloads = await claude.use('downloads');
        $('save').hidden = !downloads;
      } catch { downloads = null; }
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
    if (tries === 4) $('save').hidden = false; // no claude.ai host: plain browser download
  }
})();

// ---------- start
const startPreset = PRESETS.find((p) => p.id === DEFAULT_PRESET) || PRESETS[0];
presetId = startPreset.id;
writeParams(startPreset.params);
renderPresets();
loadSrc(document.body.dataset.sample || 'assets/sample.jpg');
