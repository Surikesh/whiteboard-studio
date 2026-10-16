import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindingsFrom, createLabEditor, shapesOfType } from "./helpers/headless-editor.mjs";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../public/diagrams/${name}.diagram.json`, import.meta.url), "utf8"));
const lab = await createLabEditor();
const fresh = () => lab.newEditor();
const typeCounts = (editor) => Object.fromEntries([...Map.groupBy(editor.getCurrentPageShapes(), (shape) => shape.type)].map(([type, list]) => [type, list.length]));

test("isDiagramSpec accepts only tldraw-lab/v1 specs with nodes (and a full sequence)", () => {
  const { isDiagramSpec } = lab.app;
  assert.equal(isDiagramSpec({ format: "tldraw-lab/v1", nodes: [] }), true);
  assert.equal(isDiagramSpec({ format: "other", nodes: [] }), false);
  assert.equal(isDiagramSpec({ format: "tldraw-lab/v1" }), false);
  assert.equal(isDiagramSpec(null), false);
  assert.equal(isDiagramSpec({ format: "tldraw-lab/v1", nodes: [], diagramType: "sequence" }), false);
  assert.equal(isDiagramSpec({ format: "tldraw-lab/v1", nodes: [], diagramType: "sequence", sequence: { participants: [], messages: [] } }), true);
});

test("graph loader: demo diagram becomes title, asset shapes and bound arrows", () => {
  const spec = fixture("demo-web-architecture");
  const editor = fresh();
  lab.app.loadDiagramSpec(editor, spec);
  assert.deepEqual(typeCounts(editor), { text: 1, "diagram-asset": spec.nodes.length, arrow: spec.edges.length });
  for (const node of spec.nodes)
    assert.ok(
      editor.getCurrentPageShapes().some((shape) => shape.id.startsWith(`shape:spec-${node.id}-`)),
      node.id,
    );
  const arrows = shapesOfType(editor, "arrow");
  const bindings = bindingsFrom(editor, arrows);
  assert.equal(bindings.length, arrows.length * 2);
  for (const binding of bindings) assert.ok(editor.getShape(binding.toId), "binding target exists");
  assert.equal(new Set(editor.getCurrentPageShapes().map((shape) => shape.id)).size, editor.getCurrentPageShapes().length);
});

test("graph loader: example fixtures create native geo boxes with the spec labels", () => {
  for (const name of ["example", "example-validated"]) {
    const spec = fixture(name);
    const editor = fresh();
    lab.app.loadDiagramSpec(editor, spec);
    assert.equal(shapesOfType(editor, "geo").length, spec.nodes.length, name);
    assert.equal(shapesOfType(editor, "arrow").length, (spec.edges ?? []).length, name);
    assert.equal(bindingsFrom(editor, shapesOfType(editor, "arrow")).length, (spec.edges ?? []).length * 2, name);
  }
});

test("graph loader: node kinds map to service, asset (unknown kind falls back), text and divider shapes", () => {
  const editor = fresh();
  lab.app.loadDiagramSpec(editor, {
    format: "tldraw-lab/v1",
    nodes: [
      { id: "svc", label: "Svc", x: 0, y: 0, kind: "service", technology: "Go" },
      { id: "old", label: "Old", x: 300, y: 0, kind: "asset", assetKind: "jira" },
      { id: "bare", label: "Bare", x: 600, y: 0, kind: "asset" },
      { id: "txt", label: "Text", x: 0, y: 300, kind: "text" },
      { id: "div", label: "", x: 300, y: 300, kind: "divider" },
    ],
  });
  assert.equal(shapesOfType(editor, "service-card").length, 1);
  assert.equal(shapesOfType(editor, "service-card")[0].props.technology, "Go");
  const assets = shapesOfType(editor, "diagram-asset");
  assert.deepEqual(assets.map((shape) => shape.props.kind).sort(), ["generic", "server"]);
  assert.equal(shapesOfType(editor, "text").length, 1);
  assert.equal(shapesOfType(editor, "line").length, 1);
});

test("graph loader: unknown edge endpoint throws", () => {
  const editor = fresh();
  assert.throws(() => lab.app.loadDiagramSpec(editor, { format: "tldraw-lab/v1", nodes: [{ id: "a", label: "A", x: 0, y: 0 }], edges: [{ from: "a", to: "missing" }] }), /Unknown edge endpoint/);
});

test("sequence loader: participants get header, lifeline and footer; messages become arrows", () => {
  const editor = fresh();
  lab.app.loadDiagramSpec(editor, {
    format: "tldraw-lab/v1",
    diagramType: "sequence",
    title: "Flow",
    nodes: [],
    sequence: {
      participants: [
        { id: "u", label: "User" },
        { id: "s", label: "Service", icon: "S" },
      ],
      messages: [
        { from: "u", to: "s", label: "ask" },
        { from: "s", to: "u", label: "answer", dashed: true },
      ],
    },
  });
  assert.deepEqual(typeCounts(editor), { text: 1, geo: 4, line: 2, arrow: 2 });
  assert.equal(bindingsFrom(editor, shapesOfType(editor, "arrow")).length, 0);
});

test("sequence loader: unknown participant and self message throw", () => {
  const base = { format: "tldraw-lab/v1", diagramType: "sequence", nodes: [] };
  const participants = [
    { id: "u", label: "U" },
    { id: "s", label: "S" },
  ];
  assert.throws(() => lab.app.loadDiagramSpec(fresh(), { ...base, sequence: { participants, messages: [{ from: "u", to: "x", label: "?" }] } }), /Unknown sequence participant/);
  assert.throws(() => lab.app.loadDiagramSpec(fresh(), { ...base, sequence: { participants, messages: [{ from: "u", to: "u", label: "?" }] } }), /Self messages/);
});

test("table loader: comparison spec becomes a (rows + header) x (columns + criterion) geo grid", () => {
  const editor = fresh();
  lab.app.loadDiagramSpec(editor, {
    format: "tldraw-lab/v1",
    diagramType: "comparison",
    title: "Options",
    nodes: [],
    table: {
      columns: ["A", "B"],
      rows: [
        { label: "Cost", values: ["1", "2"] },
        { label: "Speed", values: ["3", "4"] },
      ],
    },
  });
  assert.deepEqual(typeCounts(editor), { text: 1, geo: 9 });
});
