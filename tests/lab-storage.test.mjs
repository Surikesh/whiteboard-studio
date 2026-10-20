import assert from "node:assert/strict";
import test from "node:test";
import { boardFileId, boardFileName, isSafeBasename, revisionFileName, revisionFileTime, revisionsToPrune, safeTitle, shouldWriteRevision, snapshotToTldr } from "../scripts/lib/lab-storage.mjs";

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
