// @ts-check
// Depth from a single photo, estimated in the browser (Depth Anything V2 small via transformers.js).
// The model is downloaded on first use only, then cached by the browser. Pictures never leave the device.

// Both pinned to exact versions: a new upstream release can't change or break 3D without a code change here.
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MODEL = 'onnx-community/depth-anything-v2-small';
const MODEL_REVISION = '4472b7362082ad9968fee890ca0f1e5aca36b93d';

/** @type {Promise<any> | null} */
let estimator = null;

/** @param {(message: string) => void} onProgress */
function load(onProgress) {
  if (estimator) return estimator;
  estimator = (async () => {
    const { pipeline } = await import(/* webpackIgnore: true */ LIB);
    /** @type {Record<string, {loaded?: number, total?: number}>} */
    const files = {};
    const progress_callback = (e) => {
      if (e.status !== 'progress') return;
      files[e.file] = e;
      const sum = (/** @type {'loaded' | 'total'} */ k) => Object.values(files).reduce((s, f) => s + (f[k] || 0), 0);
      onProgress(
        `Downloading the 3D model (once)… ${Math.round(sum('loaded') / 1e6)} of ${Math.round(sum('total') / 1e6)} MB`,
      );
    };
    try {
      if (!(/** @type {any} */ (navigator).gpu)) throw new Error('no WebGPU');
      return await pipeline('depth-estimation', MODEL, {
        revision: MODEL_REVISION,
        device: 'webgpu',
        dtype: 'fp32',
        progress_callback,
      });
    } catch {
      // CPU fallback, slower
      return await pipeline('depth-estimation', MODEL, { revision: MODEL_REVISION, progress_callback });
    }
  })();
  estimator.catch(() => {
    estimator = null;
  }); // allow a retry after a failed download
  return estimator;
}

/**
 * Estimate depth for a picture. Bright = near.
 * @param {HTMLCanvasElement} picture @param {(message: string) => void} onProgress
 * @returns {Promise<{data: Uint8Array, width: number, height: number}>}
 */
export async function estimateDepth(picture, onProgress) {
  const est = await load(onProgress);
  onProgress('Working out what is near and far…');
  const blob = await new Promise((resolve) => picture.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(blob);
  try {
    let out = await est(url);
    if (Array.isArray(out)) out = out[0];
    const { data, width, height } = out.depth;
    return { data: Uint8Array.from(data), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
