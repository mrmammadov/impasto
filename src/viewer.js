// @ts-check
// Shows the finished painting as an object: paint relief lit by a moving light, an optional gold
// frame lit by the same light, and optional 3D parallax from a depth map. One WebGL pass.

const VS = `attribute vec2 p; varying vec2 v_uv;
void main() { v_uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_img, u_h, u_depth;
uniform vec2 u_px, u_size, u_tilt, u_zoom;
uniform float u_frame, u_relief, u_depthAmt, u_focus;

vec2 puv;  // where this pixel falls on the painting (0-1)
float h(vec2 o) { return texture2D(u_h, puv + o * u_px).r; }

// ---- gold frame: height across the moulding, s = 0 at the outer edge, 1 at the painting
float bump(float s, float c, float w) { float d = (s - c) / w; return exp(-d * d); }
float profile(float s) {
  return 0.7 * smoothstep(0.0, 0.14, s)        // rounded outer edge
       + 0.22 * bump(s, 0.33, 0.07)            // a bead
       + 0.12 * bump(s, 0.47, 0.05)            // a smaller bead
       - 0.55 * smoothstep(0.55, 0.88, s)      // cove sweeping down toward the picture
       + 0.18 * bump(s, 0.93, 0.035);          // thin inner lip
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 gold(vec2 pc, vec3 L) {
  // the nearest outer edge decides which side this is, which gives mitred corners for free
  float dl = pc.x, dr = u_size.x - pc.x, dt = pc.y, db = u_size.y - pc.y;
  float m = min(min(dl, dr), min(dt, db));
  vec2 outward = m == dl ? vec2(-1, 0) : m == dr ? vec2(1, 0) : m == dt ? vec2(0, -1) : vec2(0, 1);
  float along = outward.x != 0.0 ? pc.y : pc.x;
  float s = m / u_frame, e = 0.004;
  float slope = (profile(s + e) - profile(s - e)) / (2.0 * e);
  vec2 g = -outward * slope * 2.2;
  float fine = noise(vec2(along * 0.15, s * 30.0));
  g += (fine - 0.5) * 0.25 * vec2(outward.y, outward.x);
  vec3 n = normalize(vec3(-g.x, g.y, 1.0));
  float ao = 0.55 + 0.45 * smoothstep(-0.3, 0.7, profile(s));   // recesses get less light
  float nh = max(dot(n, normalize(L + vec3(0, 0, 1))), 0.0);
  vec3 c = mix(vec3(0.55, 0.38, 0.14), vec3(0.86, 0.68, 0.36), fine);
  c = mix(c, vec3(0.35, 0.2, 0.12), smoothstep(0.75, 0.95, noise(vec2(along * 0.04, s * 6.0))) * 0.5); // rubbed gilt
  return c * ao * (0.25 + 0.95 * max(dot(n, L), 0.0)) + vec3(1.0, 0.85, 0.55) * pow(nh, 28.0) * 0.9 * ao;
}

void main() {
  // the light swings across as the picture tilts; at rest it sits up and to the left
  vec3 L = normalize(vec3(-0.35 - u_tilt.x * 0.9, 0.35 + u_tilt.y * 0.9, 0.8));
  vec2 pc = v_uv * u_size;
  vec2 W = u_size - 2.0 * u_frame;
  vec2 inner = pc - vec2(u_frame);
  if (u_frame > 0.0 && (inner.x < 0.0 || inner.y < 0.0 || inner.x > W.x || inner.y > W.y)) {
    gl_FragColor = vec4(gold(pc, L), 1.0);
    return;
  }
  puv = inner / W;

  // 3D: for this pixel, walk from near to far and take the first surface that lands here after
  // shifting by (depth - pivot); that keeps near things in front of far ones
  if (u_depthAmt > 0.0) {
    vec2 uv = 0.5 + (puv - 0.5) * u_zoom;        // zoomed in just enough that shifts never show the edge
    vec2 off = -u_tilt * u_depthAmt * vec2(1.0, W.x / W.y);
    vec2 hit = uv;
    for (int i = 0; i <= 48; i++) {
      float d = 1.0 - float(i) / 48.0;
      hit = clamp(uv - (d - u_focus) * off, 0.0, 1.0);
      if (texture2D(u_depth, hit).r >= d) break;
    }
    puv = hit;
  }

  vec3 c = texture2D(u_img, puv).rgb;
  if (u_relief > 0.0) {
    // slope of the paint (Sobel) -> which way the surface faces -> how much light it catches
    float tl = h(vec2(-1,-1)), t = h(vec2(0,-1)), tr = h(vec2(1,-1));
    float l = h(vec2(-1, 0)),                     r = h(vec2(1, 0));
    float bl = h(vec2(-1, 1)), b = h(vec2(0, 1)), br = h(vec2(1, 1));
    float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    float dy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
    vec3 n = normalize(vec3(-dx * u_relief, dy * u_relief, 1.0));
    float diffuse = dot(n, L) - L.z;                     // 0 on flat paint: colours stay true
    diffuse = diffuse < 0.0 ? diffuse * 0.45 : diffuse;  // soft shadows, like translucent paint
    float spec = pow(max(dot(n, normalize(L + vec3(0, 0, 1))), 0.0), 40.0) * step(0.0005, abs(dx) + abs(dy));
    c = c * (1.0 + diffuse * 1.1) + vec3(1.0, 0.97, 0.9) * spec * 0.45 * (0.35 + 0.65 * length(u_tilt));
  }

  // the painting sits below the frame's lip: the lip on the light's side casts a thin shadow
  if (u_frame > 0.0) {
    float w = u_frame * 0.16;
    float sh = max(-L.x, 0.0) * (1.0 - smoothstep(0.0, w, inner.x))
             + max(L.x, 0.0) * (1.0 - smoothstep(0.0, w, W.x - inner.x))
             + max(L.y, 0.0) * (1.0 - smoothstep(0.0, w, inner.y))
             + max(-L.y, 0.0) * (1.0 - smoothstep(0.0, w, W.y - inner.y));
    c *= 1.0 - 0.6 * clamp(sh, 0.0, 1.0);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * @typedef {Object} ViewOptions
 * @property {number} relief    Paint thickness; 0 = flat.
 * @property {boolean} frame    Gold frame around the painting.
 * @property {number} depth     3D strength as a share of the width; 0 = off.
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {() => void} [onRestored]  Called when the GPU context comes back after being lost.
 */
export function createViewer(canvas, onRestored) {
  const gl = /** @type {WebGLRenderingContext} */ (canvas.getContext('webgl', { preserveDrawingBuffer: true }));
  if (!gl) return null;

  /** @type {WebGLProgram} */
  let prog;
  /** @param {string} n */
  const U = (n) => gl.getUniformLocation(prog, n);
  /** @param {number} unit @param {Uint8Array} data @param {number} w @param {number} h */
  const grey = (unit, data, w, h) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, data);
  };

  // Everything on the GPU is built here, so it can be rebuilt if the browser drops the context
  // (phones under memory pressure, GPU resets). What was shown is kept to upload again.
  function init() {
    /** @param {number} type @param {string} src */
    const shader = (type, src) => {
      const sh = /** @type {WebGLShader} */ (gl.createShader(type));
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(String(gl.getShaderInfoLog(sh)));
      return sh;
    };
    prog = /** @type {WebGLProgram} */ (gl.createProgram());
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    for (let unit = 0; unit < 3; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
      gl.uniform1i(U(['u_img', 'u_h', 'u_depth'][unit]), unit);
    }
    grey(1, new Uint8Array([128]), 1, 1);
    grey(2, new Uint8Array([128]), 1, 1);
  }
  init();

  let W = 1,
    H = 1,
    F = 0,
    lost = false;
  /** @type {ViewOptions} */
  let opts = { relief: 1.5, frame: true, depth: 0 };
  /** @type {{painting: HTMLCanvasElement, height: Uint8Array} | null} */
  let shown = null;
  /** @type {{data: Uint8Array, width: number, height: number} | null} */
  let depthMap = null;

  function layout() {
    F = opts.frame ? Math.round(Math.min(W, H) * 0.1) : 0;
    canvas.width = W + 2 * F;
    canvas.height = H + 2 * F;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(U('u_frame'), F);
    gl.uniform2f(U('u_size'), canvas.width, canvas.height);
    gl.uniform2f(U('u_px'), 1 / W, 1 / H);
  }
  function upload() {
    if (shown) {
      W = shown.painting.width;
      H = shown.painting.height;
      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, shown.painting);
      grey(1, shown.height, W, H);
    }
    if (depthMap) grey(2, depthMap.data, depthMap.width, depthMap.height);
    layout();
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    init();
    upload();
    onRestored?.();
  });

  return {
    /**
     * A freshly painted picture and its paint thickness.
     * @param {HTMLCanvasElement} painting @param {Uint8Array} height
     */
    setPainting(painting, height) {
      shown = { painting, height };
      if (!lost) upload();
    },
    /** @param {{data: Uint8Array, width: number, height: number} | null} depth */
    setDepth(depth) {
      depthMap = depth;
      if (depth && !lost) grey(2, depth.data, depth.width, depth.height);
    },
    /** @param {Partial<ViewOptions>} next */
    setOptions(next) {
      const frameChanged = next.frame !== undefined && next.frame !== opts.frame;
      opts = { ...opts, ...next };
      if (frameChanged && !lost) layout();
    },
    /** Share of each side taken by the frame, for placing overlays on the painting itself. */
    inset() {
      return { x: F / canvas.width, y: F / canvas.height };
    },
    /** @param {number} tx @param {number} ty */
    render(tx, ty) {
      if (lost) return;
      const depth = depthMap ? opts.depth : 0;
      const focus = 0.4; // this depth stays still; nearer and farther things move in opposite directions
      const reach = depth * Math.max(focus, 1 - focus);
      gl.uniform2f(U('u_tilt'), tx, ty);
      gl.uniform1f(U('u_relief'), opts.relief);
      gl.uniform1f(U('u_depthAmt'), depth);
      gl.uniform1f(U('u_focus'), focus);
      gl.uniform2f(U('u_zoom'), 1 - 2 * reach, 1 - 2 * reach * (W / H));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}
