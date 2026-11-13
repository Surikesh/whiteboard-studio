// Spec format ids, shared by the app (TypeScript) and the Node scripts.
export const SPEC_FORMAT = "whiteboard-studio/v1";
/** Same schema under the project's earlier name; accepted on read so older specs keep loading. */
export const LEGACY_SPEC_FORMATS = ["tldraw-lab/v1"];

/** @param {unknown} format */
export function isSpecFormat(format) {
  return format === SPEC_FORMAT || LEGACY_SPEC_FORMATS.includes(/** @type {string} */ (format));
}

/** True for an object with a known spec format and a `nodes` array. */
export function isSpecShape(/** @type {any} */ spec) {
  return Boolean(spec) && isSpecFormat(spec.format) && Array.isArray(spec.nodes);
}
