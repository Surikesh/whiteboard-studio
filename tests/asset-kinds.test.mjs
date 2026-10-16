import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_KINDS, isAssetKind, resolveAssetKind } from "../app/asset-kinds.ts";

test("catalog keeps the generic kinds", () => {
  assert.equal(ASSET_KINDS.length, 25);
  assert.equal(new Set(ASSET_KINDS).size, ASSET_KINDS.length);
});

test("known kinds resolve to themselves", () => {
  for (const kind of ASSET_KINDS) assert.equal(resolveAssetKind(kind), kind);
});

test("removed or unknown kinds resolve to the neutral fallback without throwing", () => {
  for (const kind of ["jira", "orchestrator", "runtime", "pi-agent", "", undefined, null, 42]) {
    assert.equal(isAssetKind(kind), false);
    assert.equal(resolveAssetKind(kind), "generic");
  }
});
