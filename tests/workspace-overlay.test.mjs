import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { labPaths } from "../scripts/lib/lab-config.mjs";
import { appUrl, openBoard } from "../scripts/lib/open-board.mjs";
import { diagramName, mergedIndex, resolveDiagramFile } from "../scripts/lib/workspace-overlay.mjs";

const projectDir = path.resolve(import.meta.dirname, "..");
const demoIndex = JSON.parse(readFileSync(path.join(projectDir, "public/workspace/index.json"), "utf8"));

function dataDir() {
  return labPaths(mkdtempSync(path.join(os.tmpdir(), "overlay-")));
}

test("the merged index keeps demo boards, lets a user entry replace one, and appends user boards", () => {
  const paths = dataDir();
  mkdirSync(path.dirname(paths.workspaceIndex), { recursive: true });
  const override = { ...demoIndex[0], title: "Renamed by the user" };
  writeFileSync(paths.workspaceIndex, JSON.stringify([{ id: "td_user1", title: "Mine", sourceUrl: "/diagrams/td_user1.diagram.json" }, override]));
  const merged = mergedIndex(projectDir, paths);
  assert.equal(merged.length, demoIndex.length + 1);
  assert.equal(merged[0].title, "Renamed by the user");
  assert.equal(merged.at(-1).id, "td_user1");
});

test("a user spec wins over a demo spec; odd names are refused", () => {
  const paths = dataDir();
  const demo = "/diagrams/example.diagram.json";
  assert.equal(resolveDiagramFile(projectDir, paths, demo), path.join(projectDir, "public/diagrams/example.diagram.json"));
  mkdirSync(paths.diagrams, { recursive: true });
  writeFileSync(path.join(paths.diagrams, "example.diagram.json"), "{}");
  assert.equal(resolveDiagramFile(projectDir, paths, demo), path.join(paths.diagrams, "example.diagram.json"));
  for (const bad of ["/diagrams/../workspace/index.json", "/diagrams/a/b.json", "/diagrams/.hidden.json", "/other/x.json", "/diagrams/x.txt"])
    assert.equal(diagramName(bad), null, bad);
  assert.equal(resolveDiagramFile(projectDir, paths, "/diagrams/missing.diagram.json"), null);
});

test("workspace create and patch write only to the data directory", () => {
  const paths = dataDir();
  const env = { ...process.env, WHITEBOARD_STUDIO_DATA_DIR: paths.root, WHITEBOARD_STUDIO_URL: "http://127.0.0.1:9" };
  const before = readFileSync(path.join(projectDir, "public/workspace/index.json"), "utf8");
  const spec = path.join(paths.root, "in.json");
  writeFileSync(spec, JSON.stringify({ format: "tldraw-lab/v1", title: "T", nodes: [{ id: "a", label: "A" }] }));
  const create = spawnSync(process.execPath, ["scripts/workspace.mjs", "create", spec, "--title", "Board"], { cwd: projectDir, env, encoding: "utf8" });
  assert.equal(create.status, 0, create.stderr);
  const { id } = JSON.parse(create.stdout);
  const saved = JSON.parse(readFileSync(path.join(paths.diagrams, `${id}.diagram.json`), "utf8"));
  assert.equal(saved.format, "whiteboard-studio/v1");
  assert.equal(JSON.parse(readFileSync(paths.workspaceIndex, "utf8"))[0].id, id);

  // Patching a demo board stores the user's copy and an overriding index entry.
  const patch = path.join(paths.root, "patch.json");
  writeFileSync(patch, JSON.stringify({ addNodes: [{ id: "zz-extra", label: "Extra" }], metadata: { status: "ready" } }));
  const demoId = demoIndex.find((item) => item.sourceUrl === "/diagrams/example.diagram.json").id;
  const patched = spawnSync(process.execPath, ["scripts/workspace.mjs", "patch", demoId, patch], { cwd: projectDir, env, encoding: "utf8" });
  assert.equal(patched.status, 0, patched.stderr);
  assert.ok(existsSync(path.join(paths.diagrams, "example.diagram.json")));
  assert.equal(mergedIndex(projectDir, paths).find((item) => item.id === demoId).status, "ready");
  const list = spawnSync(process.execPath, ["scripts/workspace.mjs", "list"], { cwd: projectDir, env, encoding: "utf8" });
  assert.match(list.stdout, new RegExp(id));
  assert.equal(readFileSync(path.join(projectDir, "public/workspace/index.json"), "utf8"), before, "the repository index is untouched");
  assert.ok(!readFileSync(path.join(projectDir, "public/diagrams/example.diagram.json"), "utf8").includes("zz-extra"), "the demo spec is untouched");
});

test("boards open in the macOS app through its URL scheme, with a browser fallback", () => {
  assert.equal(appUrl("http://127.0.0.1:4174/d/td_x?y=1"), "whiteboardstudio://127.0.0.1:4174/d/td_x?y=1");
  assert.equal(appUrl("https://example.trycloudflare.com/d/td_x"), null);
  const calls = [];
  const run = (status) => (cmd, args) => (calls.push([cmd, ...args]), { status });
  assert.equal(openBoard("http://127.0.0.1:4174/d/td_x", { platform: "darwin", run: run(0) }), "app");
  assert.deepEqual(calls.pop(), ["open", "whiteboardstudio://127.0.0.1:4174/d/td_x"]);
  calls.length = 0;
  assert.equal(openBoard("http://127.0.0.1:4174/d/td_x", { platform: "darwin", run: run(1) }), "browser");
  assert.deepEqual(calls, [["open", "whiteboardstudio://127.0.0.1:4174/d/td_x"], ["open", "http://127.0.0.1:4174/d/td_x"]]);
});
