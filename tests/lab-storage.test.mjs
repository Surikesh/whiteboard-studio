import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { labPaths } from "../scripts/lib/lab-config.mjs";
import { boardFileId, boardFileName, isSafeBasename, revisionFileName, revisionFileTime, revisionsToPrune, safeTitle, shouldWriteRevision, snapshotToTldr } from "../scripts/lib/lab-storage.mjs";
import { migrateData } from "../scripts/lib/migrate-data.mjs";

test("snapshotToTldr produces tldraw file shape and inlines agent assets", () => {
  const snapshot = {
    schema: { schemaVersion: 2, sequences: {} },
    documents: [
      { state: { id: "shape:a", typeName: "shape" }, lastChangedClock: 1 },
      { state: { id: "asset:a", typeName: "asset", props: { src: "/api/agent/assets/p.png" } }, lastChangedClock: 2 },
      { state: { id: "asset:b", typeName: "asset", props: { src: "/api/agent/assets/missing.png" } }, lastChangedClock: 2 },
    ],
  };
  const file = snapshotToTldr(snapshot, (n) => (n === "p.png" ? Buffer.from("hi") : null));
  assert.equal(file.tldrawFileFormatVersion, 1);
  assert.deepEqual(file.schema, snapshot.schema);
  assert.equal(file.records.length, 3);
  assert.equal(file.records[1].props.src, "data:image/png;base64,aGk=");
  assert.equal(file.records[2].props.src, "/api/agent/assets/missing.png");
});

test("filenames are sanitized and reversible", () => {
  assert.equal(safeTitle('a/b:c*?"<>|'), "a b c");
  assert.equal(safeTitle("../.."), "Untitled".length ? safeTitle("../..") : "");
  assert.ok(!safeTitle("../../x").includes("/"));
  assert.equal(safeTitle("   "), "Untitled");
  assert.equal(boardFileId(boardFileName("Diagram / 1", "td_abc1")), "td_abc1");
  assert.equal(isSafeBasename("../x"), false);
  assert.equal(isSafeBasename("a/b"), false);
  assert.equal(isSafeBasename("x.tldr"), true);
});

test("revision naming, pruning and interval decision", () => {
  const d = new Date("2026-10-14T10:20:30.123Z");
  const name = revisionFileName(d);
  assert.ok(!name.includes(":"));
  assert.equal(revisionFileTime(name).toISOString(), d.toISOString());
  const files = ["2026-01-01T00-00-00.000Z.tldr", "2026-01-03T00-00-00.000Z.tldr", "2026-01-02T00-00-00.000Z.tldr"];
  assert.deepEqual(revisionsToPrune(files, 2), ["2026-01-01T00-00-00.000Z.tldr"]);
  assert.deepEqual(revisionsToPrune(files, 5), []);
  const now = new Date("2026-01-03T00:10:00.000Z");
  assert.equal(shouldWriteRevision(files, now, 30), false);
  assert.equal(shouldWriteRevision(files, new Date("2026-01-03T00:31:00.000Z"), 30), true);
  assert.equal(shouldWriteRevision([], now, 30), true);
});

test("migration copies legacy data once and never touches the source", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "lab-mig-"));
  const project = path.join(tmp, "project");
  mkdirSync(path.join(project, ".wrangler/state/v3/do/x"), { recursive: true });
  mkdirSync(path.join(project, ".share-tunnel/agent-assets"), { recursive: true });
  writeFileSync(path.join(project, ".wrangler/state/v3/do/x/a.sqlite"), "db");
  writeFileSync(path.join(project, ".share-tunnel/agent-assets/p.png"), "img");
  writeFileSync(path.join(project, ".share-tunnel/agent-messages.json"), "[]");
  const paths = labPaths(path.join(tmp, "data"));
  const logs = [];
  const actions = migrateData({ projectDir: project, paths, log: (m) => logs.push(m) });
  assert.equal(actions.length, 3);
  assert.equal(readFileSync(path.join(paths.state, "v3/do/x/a.sqlite"), "utf8"), "db");
  assert.equal(readFileSync(path.join(paths.assets, "p.png"), "utf8"), "img");
  assert.ok(existsSync(paths.messages));
  assert.ok(existsSync(path.join(project, ".wrangler/state/v3/do/x/a.sqlite")));
  writeFileSync(path.join(paths.state, "v3/do/x/a.sqlite"), "newer");
  assert.equal(migrateData({ projectDir: project, paths, log() {} }).length, 0);
  assert.equal(readFileSync(path.join(paths.state, "v3/do/x/a.sqlite"), "utf8"), "newer");
});
