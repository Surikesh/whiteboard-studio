import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SPEC_FORMAT, isSpecShape, normalizeSpec } from "../app/domain/spec/format.mjs";

test("the legacy spec id is read but never written", () => {
  const legacy = { format: "tldraw-lab/v1", nodes: [] };
  assert.ok(isSpecShape(legacy));
  assert.equal(normalizeSpec(legacy).format, SPEC_FORMAT);
  assert.equal(isSpecShape({ format: "other/v1", nodes: [] }), false);
});

// The bridge and the CLIs must use the shared check, so the legacy alias works everywhere.
for (const file of ["scripts/agent-bridge.mjs", "scripts/diagram.mjs", "scripts/workspace.mjs"]) {
  test(`${file} checks spec formats through app/domain/spec/format.mjs`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /from "\.\.\/app\/domain\/spec\/format\.mjs"/);
    assert.doesNotMatch(source, /format\s*[!=]==?\s*["']/, "no literal format comparison");
  });
}
for (const file of ["scripts/diagram.mjs", "scripts/workspace.mjs"]) {
  test(`${file} writes specs through normalizeSpec`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const write of source.match(/writeFile\([^;]*diagram[^;]*;|writeFile\(specPath[^;]*;|writeFile\(output[^;]*;/g) ?? [])
      assert.match(write, /normalizeSpec\(/, write);
  });
}
