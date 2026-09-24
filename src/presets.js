// @ts-check
// Presets are plain data: a style id plus starting values for the sliders.
// Add one by appending an object; the UI picks it up automatically.

/** @type {import('./types.js').Preset[]} */
export const PRESETS = [
  {
    id: 'loose-oil',
    name: 'Loose oil',
    description: 'Big, gestural strokes. Detail only where the small brush works.',
    style: 'oil',
    params: { size: 1, detail: 0.2, length: 1, dry: 0.4, sharp: 0.12 },
  },
  {
    id: 'detailed-oil',
    name: 'Detailed oil',
    description: 'Smaller brushes everywhere, closer to the picture.',
    style: 'oil',
    params: { size: 0.8, detail: 0.85, length: 0.9, dry: 0.2, sharp: 0.2 },
  },
  {
    id: 'impasto',
    name: 'Impasto',
    description: 'Short, thick dabs of paint, like Van Gogh.',
    style: 'oil',
    params: { size: 1.3, detail: 0.35, length: 0.45, dry: 0.15, sharp: 0.1 },
  },
  {
    id: 'palette-knife',
    name: 'Palette knife',
    description: 'Flat, hard-edged slabs of paint with scraped edges.',
    style: 'knife',
    params: { size: 1.2, detail: 0.4, length: 0.7, dry: 0.5, sharp: 0.1 },
  },
];

export const DEFAULT_PRESET = PRESETS[0].id;
