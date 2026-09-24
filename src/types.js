// @ts-check
// Shared type definitions (JSDoc). Nothing here runs; editors and `tsc --checkJs` read it.

/**
 * The settings every style understands. Each value is a plain number so presets stay simple data.
 * @typedef {Object} BrushParams
 * @property {number} size    Brush size multiplier, 0.5–2 (1 = default).
 * @property {number} detail  0 = loosest, 1 = finest. Controls how many brush sizes are used.
 * @property {number} length  Stroke length multiplier, 0.4–2.
 * @property {number} dry     0–1. How often strokes break up and let the ground show through.
 * @property {number} sharp   0–0.4. Fraction of the picture the small brush may work on (0 = off).
 */

/**
 * One stroke, as decided by the painter. Styles decide how it looks.
 * @typedef {Object} Stroke
 * @property {Array<[number, number]>} points  Centre line in canvas pixels.
 * @property {[number, number, number]} color  RGB, 0–1.
 * @property {number} radius                   Brush radius in canvas pixels.
 */

/**
 * What a style receives besides the stroke itself.
 * @typedef {Object} StrokeEnv
 * @property {() => number} rng                 Seeded random number in [0, 1).
 * @property {BrushParams} params
 * @property {(x: number, y: number) => number} flow  Default stroke angle (radians) in flat areas.
 */

/**
 * A brush style: how strokes are drawn and how the painting is finished.
 * Add a new file in src/styles/, export one of these, and register it in src/styles/index.js.
 * @typedef {Object} BrushStyle
 * @property {string} id
 * @property {string} name
 * @property {(ctx: CanvasRenderingContext2D, stroke: Stroke, env: StrokeEnv) => void} render
 * @property {(ctx: CanvasRenderingContext2D, width: number, height: number, rng: () => number) => void} [finish]
 * @property {(avg: [number, number, number]) => string} [ground]  CSS colour for the underpainting.
 */

/**
 * A named starting point shown to the user.
 * @typedef {Object} Preset
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} style        Id of a registered BrushStyle.
 * @property {BrushParams} params
 */

/**
 * @typedef {Object} PaintJob
 * @property {CanvasRenderingContext2D} ctx           Target canvas context (it is resized to fit).
 * @property {CanvasImageSource & {naturalWidth: number, naturalHeight: number}} image
 * @property {BrushParams} params
 * @property {BrushStyle} style
 * @property {number} seed
 * @property {number} longSide                        Output size of the longest side, in pixels.
 * @property {{x: number, y: number} | null} focusPoint  Normalised 0–1, or null for automatic.
 * @property {(fraction: number, message: string) => void} [onProgress]
 * @property {() => boolean} [isCancelled]
 */

/**
 * @typedef {Object} PaintResult
 * @property {number} strokes
 * @property {number} seconds
 */

export {};
