import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_ID_MAX_LENGTH, isWorkspaceId } from "../app/io/workspace-id.mjs";
import { boardFileId, boardFileName, isBoardId } from "../scripts/lib/lab-storage.mjs";
import { loadAppModule } from "./helpers/load-app.mjs";

const { newDocument } = await loadAppModule("app/io/workspace-storage.ts");

test("every shipped id family is a valid workspace id", () => {
  for (const id of ["td_demo_web_architecture", "td_example_validated", "td_live_diagram_demo_v1", "td_live_test_1760000000000", "td_abc1", "td_x", newDocument().id]) {
    assert.equal(isWorkspaceId(id), true, id);
    assert.equal(isBoardId(id), true, id);
  }
  assert.match(`td_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, /^td_[a-z0-9]+$/); // scripts/workspace.mjs generator
  assert.equal(isWorkspaceId(`td_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`), true);
});

test("malformed ids are rejected", () => {
  const bad = [
    "",
    "td_",
    "demo",
    "td-demo",
    "td_a/b",
    "td_a\\b",
    "td_..",
    "td_a.b",
    "td_a b",
    "td_a%2Fb",
    "../td_a",
    "td_a\n",
    "td_a\0",
    "td_é",
    `td_${"a".repeat(WORKSPACE_ID_MAX_LENGTH)}`,
    null,
    undefined,
    5,
    {},
  ];
  for (const id of bad) assert.equal(isWorkspaceId(id), false, String(id));
  assert.equal(isWorkspaceId(`td_${"a".repeat(WORKSPACE_ID_MAX_LENGTH - 3)}`), true);
});

test("board file names round-trip underscore ids", () => {
  assert.equal(boardFileId(boardFileName("Web architecture", "td_demo_web_architecture")), "td_demo_web_architecture");
});
