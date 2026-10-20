import "./helpers/browser-globals.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { getSnapshot, loadSnapshot, parseTldrawJsonFile, serializeTldrawJsonBlob } from "tldraw";
import { createLabEditor } from "./helpers/headless-editor.mjs";

const lab = await createLabEditor();
const spec = {
  format: "whiteboard-studio/v1",
  title: "Roundtrip",
  nodes: [
    { id: "svc", label: "Svc", x: 0, y: 0, kind: "service", technology: "Go" },
    { id: "db", label: "DB", x: 300, y: 0, kind: "asset", assetKind: "database" },
  ],
  edges: [{ from: "svc", to: "db" }],
};
const shapeSummary = (editor) =>
  editor
    .getCurrentPageShapes()
    .map((shape) => ({ id: shape.id, type: shape.type, x: shape.x, y: shape.y, props: shape.props }))
    .sort((a, b) => a.id.localeCompare(b.id));

test("documentOnlySnapshot keeps just the document of a store snapshot", () => {
  const { documentOnlySnapshot } = lab.app;
  const snapshot = { document: { store: { a: 1 }, schema: { v: 1 } }, session: { camera: 1 } };
  assert.deepEqual(documentOnlySnapshot(snapshot), { document: snapshot.document });
  assert.deepEqual(Object.keys(documentOnlySnapshot(snapshot)), ["document"]);
});

test("documentOnlySnapshot passes through values without a document", () => {
  const { documentOnlySnapshot } = lab.app;
  const legacy = { store: {}, schema: {} };
  assert.equal(documentOnlySnapshot(legacy), legacy);
  for (const value of [null, undefined, 5, "text"]) assert.equal(documentOnlySnapshot(value), value);
});

test("a live editor snapshot reduces to a document-only snapshot that loads into a fresh editor unchanged", () => {
  const source = lab.newEditor();
  lab.app.loadDiagramSpec(source, spec);
  const stripped = lab.app.documentOnlySnapshot(JSON.parse(JSON.stringify(getSnapshot(source.store))));
  assert.deepEqual(Object.keys(stripped), ["document"]);
  const target = lab.newEditor();
  loadSnapshot(target.store, stripped);
  assert.deepEqual(shapeSummary(target), shapeSummary(source));
});

test(".tldr serialize -> parse -> load roundtrip preserves custom shapes and bindings", async () => {
  const source = lab.newEditor();
  lab.app.loadDiagramSpec(source, spec);
  const json = await (await serializeTldrawJsonBlob(source)).text();
  assert.equal(JSON.parse(json).tldrawFileFormatVersion, 1);
  const target = lab.newEditor();
  const parsed = parseTldrawJsonFile({ json, schema: target.store.schema });
  assert.equal(parsed.ok, true);
  loadSnapshot(target.store, lab.app.documentOnlySnapshot(getSnapshot(parsed.value)));
  assert.deepEqual(shapeSummary(target), shapeSummary(source));
  const arrows = target.getCurrentPageShapes().filter((shape) => shape.type === "arrow");
  assert.equal(arrows.flatMap((arrow) => target.getBindingsFromShape(arrow, "arrow")).length, 2);
});

test("parsing rejects text that is not a .tldr file", () => {
  const editor = lab.newEditor();
  assert.equal(parseTldrawJsonFile({ json: "not json", schema: editor.store.schema }).ok, false);
  assert.equal(parseTldrawJsonFile({ json: JSON.stringify({ hello: "world" }), schema: editor.store.schema }).ok, false);
});
