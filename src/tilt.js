// @ts-check
// Where the viewer is "looking from", as a tilt in [-1, 1]². Follows the pointer over an element,
// the gyroscope on phones, or a slow automatic wobble when neither is active.

/** @param {number} v */
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

/** @param {HTMLElement} el */
export function createTilt(el) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tx = 0, ty = 0, x = 0, y = 0, over = false, gyro = false;
  /** @type {number | null} */
  let beta0 = null;
  const t0 = performance.now();

  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return; // on phones the gyroscope drives it
    const r = el.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    over = true;
  });
  el.addEventListener('pointerleave', () => { over = false; });

  /** @param {DeviceOrientationEvent} e */
  const onOrient = (e) => {
    if (e.gamma == null || e.beta == null) return;
    if (beta0 == null) beta0 = e.beta; // however the phone is held at first counts as level
    gyro = true;
    tx = clamp1(e.gamma / 25);
    ty = clamp1((e.beta - beta0) / 25);
  };
  let gyroAsked = false;

  return {
    /** Ask for motion access. Must run inside a user gesture on iOS; safe to call repeatedly. */
    async requestGyro() {
      if (gyroAsked) return;
      gyroAsked = true;
      const DOE = /** @type {any} */ (window).DeviceOrientationEvent;
      try {
        if (DOE && typeof DOE.requestPermission === 'function' && (await DOE.requestPermission()) !== 'granted') return;
        window.addEventListener('deviceorientation', onOrient);
      } catch { /* no motion access: the pointer and wobble still work */ }
    },
    /**
     * Advance one frame. Returns the smoothed tilt and whether it moved enough to redraw.
     * @param {number} now
     */
    tick(now) {
      if (!over && !gyro) {
        const t = (now - t0) / 1000;
        tx = reduced ? 0 : Math.sin(t * 0.9) * 0.6;
        ty = reduced ? 0 : Math.sin(t * 0.6 + 1) * 0.35;
      }
      const nx = x + (tx - x) * 0.12, ny = y + (ty - y) * 0.12;
      const moved = Math.abs(nx - x) + Math.abs(ny - y) > 1e-4;
      x = nx; y = ny;
      return { x, y, moved };
    },
  };
}
