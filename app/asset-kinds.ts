// Compatibility re-export; the implementation lives in app/domain/asset-kinds.ts.
// Explicit .ts extension because tests/asset-kinds.test.mjs loads this file with Node type stripping.
// @ts-expect-error TS5097: allowImportingTsExtensions is not enabled
export * from "./domain/asset-kinds.ts";
