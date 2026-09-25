// @ts-check
// UI wiring only. Painting lives in painter.js, looks live in styles/, choices in presets.js.
import { paint, focusRingWidth, outputSize } from './painter.js';
import { STYLES } from './styles/index.js';
import { PRESETS, DEFAULT_PRESET } from './presets.js';
import { withHeight, paintTexture } from './height.js';
import { createViewer } from './viewer.js';
import { createTilt } from './tilt.js';
import { estimateDepth } from './depth.js';

/** @typedef {import('./types.js').BrushParams} BrushParams */

/** @param {string} id @returns {any} */
const $ = (id) => document.getElementById(id);

const canvas = /** @type {HTMLCanvasElement} */ ($('paint'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
const statusEl = $('status'), barEl = $('bar'), ring = $('ring'), originalEl = $('original');
const viewCanvas = /** @type {HTMLCanvasElement} */ ($('view'));
const frameEl = $('frame'), pic = $('pic');
const heightCanvas = document.createElement('canvas');

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
  showView(false); // watch the strokes go down on the flat canvas, then switch to the lit view
  const longSide = parseInt($('quality').value, 10);
  const { W, H } = outputSize(image, longSide);
  heightCanvas.width = W;
  heightCanvas.height = H;
  const hctx = /** @type {CanvasRenderingContext2D} */ (heightCanvas.getContext('2d', { willReadFrequently: true }));
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, W, H);
  const result = await paint({
    ctx: withHeight(ctx, hctx),
    image,
    params: readParams(),
    style: currentStyle(),
    seed,
    longSide,
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
    if (viewer) {
      viewer.setPainting(canvas, paintTexture(heightCanvas));
      showView(true);
      if (depthOn && !depth) computeDepth();
    }
  }
}

// ---------- view: relief, gold frame and 3D, drawn by the WebGL viewer over the finished painting
const viewer = createViewer(viewCanvas);
const tilt = createTilt($('stage'));
let reliefOn = true, frameOn = true, depthOn = false, viewShown = false, dirty = true, depthBusy = false;
/** @type {{data: Uint8Array, width: number, height: number} | null} */
let depth = null;
if (!viewer) $('reliefBtn').closest('.group').hidden = true; // no WebGL: the flat painting only

const moving = () => reliefOn || (depthOn && !!depth);

/** @param {boolean} on */
function showView(on) {
  viewShown = on && !!viewer;
  viewCanvas.hidden = !viewShown;
  canvas.hidden = viewShown;
  placeOverlays();
  dirty = true;
}
function placeOverlays() {
  const inset = viewShown && viewer ? viewer.inset() : { x: 0, y: 0 };
  pic.style.setProperty('--ix', `${inset.x * 100}%`);
  pic.style.setProperty('--iy', `${inset.y * 100}%`);
  frameEl.classList.toggle('lit', viewShown && moving());
}
function updateView() {
  $('reliefBtn').setAttribute('aria-pressed', String(reliefOn));
  $('frameBtn').setAttribute('aria-pressed', String(frameOn));
  $('depthBtn').setAttribute('aria-pressed', String(depthOn));
  $('reliefCtl').hidden = !reliefOn;
  $('depthCtl').hidden = !depthOn;
  $('reliefOut').textContent = `${Math.round((parseFloat($('relief').value) / 1.5) * 100)}%`;
  $('depthOut').textContent = `${Math.round((parseFloat($('depthAmt').value) / 0.025) * 100)}%`;
  viewer?.setOptions({
    relief: reliefOn ? parseFloat($('relief').value) : 0,
    frame: frameOn,
    depth: depthOn ? parseFloat($('depthAmt').value) : 0,
  });
  placeOverlays();
  dirty = true;
}

async function computeDepth() {
  if (!image || depthBusy) return;
  const img = image;
  depthBusy = true;
  $('depthBtn').disabled = true;
  try {
    const { W, H } = outputSize(img, parseInt($('quality').value, 10));
    const photo = document.createElement('canvas');
    photo.width = W;
    photo.height = H;
    /** @type {CanvasRenderingContext2D} */ (photo.getContext('2d')).drawImage(img, 0, 0, W, H);
    const d = await estimateDepth(photo, (m) => { statusEl.textContent = m; });
    if (img !== image) return; // a new picture arrived meanwhile; run() will ask again
    depth = d;
    viewer?.setDepth(d);
    statusEl.textContent = '3D ready. Move over the painting, or tilt your phone.';
  } catch (err) {
    console.error(err);
    depthOn = false;
    statusEl.textContent = '3D could not load here. Check your connection, or try Chrome or Safari.';
  } finally {
    depthBusy = false;
    $('depthBtn').disabled = false;
    updateView();
    if (depthOn && !depth && image !== img) computeDepth();
  }
}

$('reliefBtn').addEventListener('click', () => { tilt.requestGyro(); reliefOn = !reliefOn; updateView(); });
$('frameBtn').addEventListener('click', () => { frameOn = !frameOn; updateView(); });
$('depthBtn').addEventListener('click', () => {
  tilt.requestGyro();
  depthOn = !depthOn;
  updateView();
  if (depthOn && !depth) computeDepth();
});
$('relief').addEventListener('input', updateView);
$('depthAmt').addEventListener('input', updateView);
document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') tilt.requestGyro(); });

/** @param {number} now */
function frame(now) {
  if (viewShown && viewer) {
    const t = tilt.tick(now);
    if (moving()) {
      if (t.moved || dirty) {
        viewer.render(t.x, t.y);
        frameEl.style.setProperty('--rx', t.x.toFixed(3));
        frameEl.style.setProperty('--ry', t.y.toFixed(3));
      }
    } else if (dirty) {
      viewer.render(0, 0);
    }
    dirty = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
updateView();

// ---------- pictures
/** @param {string} url */
function loadSrc(url) {
  const img = new Image();
  img.onload = () => {
    image = img;
    originalEl.src = url;
    depth = null;
    viewer?.setDepth(null);
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
pic.addEventListener('click', (e) => {
  const r = pic.getBoundingClientRect();
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
  (viewShown ? viewCanvas : canvas).toBlob(async (blob) => {
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
