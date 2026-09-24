// @ts-check
// Registry of brush styles. To add a style: create src/styles/<name>.js exporting a BrushStyle,
// import it here and add it to STYLES. Presets refer to styles by id.
import { oil } from './oil.js';
import { knife } from './knife.js';

/** @type {Record<string, import('../types.js').BrushStyle>} */
export const STYLES = {
  [oil.id]: oil,
  [knife.id]: knife,
};
