# Loose Brush

Repaints any picture as a painting, stroke by stroke, in the browser.
Plain JavaScript (ES modules) with JSDoc types. No runtime dependencies.

## Project layout

```
index.html            page markup
styles.css            page styles
assets/sample.jpg     picture painted on first load
src/
  main.js             UI wiring: presets, sliders, focus, loading, saving
  painter.js          the engine: coarse-to-fine layers, where strokes go, stroke paths
  image-ops.js        helpers: seeded random, blur, Sobel gradients
  presets.js          the preset list (plain data)
  types.js            JSDoc type definitions (BrushStyle, Preset, BrushParams, ...)
  height.js           records paint thickness while the painter works (for the relief)
  viewer.js           WebGL view of the finished painting: relief lighting, gold frame, 3D parallax
  tilt.js             pointer / gyroscope / idle-wobble tilt that drives the light and 3D
  depth.js            3D: depth from the photo (Depth Anything, in the browser, loaded on first use)
  styles/
    index.js          style registry
    oil.js            bristle brush + canvas surface finish
    knife.js          palette knife
lab/                  throwaway experiments (not part of the build)
build.mjs             bundles everything into dist/loose-brush.html (one file)
```

## Run

```
npm install          # installs esbuild (only needed for the build)
npm run dev          # serves the folder at http://localhost:5173
npm run build        # writes dist/loose-brush.html, a single self-contained file
npm run typecheck    # checks the JSDoc types with TypeScript, no compile step
```

`index.html` uses ES modules, so it must be served over http (`npm run dev`, or
`python -m http.server`). Opening it by double-clicking won't load the modules;
the built `dist/loose-brush.html` does open by double-clicking.

## Add a preset

Append an object to `PRESETS` in `src/presets.js`:

```js
{
  id: 'foggy-morning',
  name: 'Foggy morning',
  description: 'Very soft, long strokes with almost no detail.',
  style: 'oil',
  params: { size: 1.6, detail: 0, length: 1.8, dry: 0.1, sharp: 0.05 },
},
```

It appears in the Style picker automatically.

## Add a style

1. Create `src/styles/mystyle.js` exporting a `BrushStyle` (see `src/types.js`):
   - `render(ctx, stroke, env)` draws one stroke. `stroke` has `points`, `color` (RGB 0–1)
     and `radius`; `env` has a seeded `rng`, the slider `params` and a `flow` function.
   - `finish(ctx, W, H, rng)` (optional) runs once at the end, e.g. for paper texture.
   - `ground(avgColor)` (optional) returns the CSS colour of the underpainting.
2. Register it in `src/styles/index.js`.
3. Add a preset that uses it (`style: 'mystyle'`).

The painter decides where strokes go and which colour they carry; a style only decides
how they look. `knife.js` is a short example of a completely different look.

## Moving to TypeScript later

The types already exist as JSDoc. To switch: rename `.js` files to `.ts`, turn the
JSDoc typedefs in `types.js` into `export type`/`interface`, and point the build at
`src/main.ts`. esbuild compiles TypeScript as is, so nothing else changes.
