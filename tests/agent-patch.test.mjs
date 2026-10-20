import assert from "node:assert/strict";
import test from "node:test";
import { createLabEditor, shapesOfType } from "./helpers/headless-editor.mjs";

const lab = await createLabEditor();
const spec = {
  format: "whiteboard-studio/v1",
  title: "Patched",
  nodes: [
    { id: "a", label: "A", x: 0, y: 0 },
    { id: "b", label: "B", x: 300, y: 0 },
  ],
  edges: [{ from: "a", to: "b" }],
};

test("applyPatchToEditor ignores a missing editor and non-object results", async () => {
  await lab.app.applyPatchToEditor(null, { patch: spec });
  const editor = lab.newEditor();
  for (const result of [null, undefined, "text", 5]) await lab.app.applyPatchToEditor(editor, result);
  assert.equal(editor.getCurrentPageShapes().length, 0);
});

test("applyPatchToEditor ignores a patch that is not a diagram spec", async () => {
  const editor = lab.newEditor();
  await lab.app.applyPatchToEditor(editor, { patch: { format: "other", nodes: [] } });
  await lab.app.applyPatchToEditor(editor, { images: [] });
  assert.equal(editor.getCurrentPageShapes().length, 0);
});

test("applyPatchToEditor loads a diagram spec patch as new shapes, starting hidden for the fade-in", async () => {
  const editor = lab.newEditor();
  await lab.app.applyPatchToEditor(editor, { patch: spec, images: [] });
  const shapes = editor.getCurrentPageShapes();
  assert.equal(shapesOfType(editor, "geo").length, 2);
  assert.equal(shapesOfType(editor, "arrow").length, 1);
  assert.equal(shapesOfType(editor, "text").length, 1);
  assert.ok(
    shapes.every((shape) => shape.opacity === 0),
    "appeared shapes start at opacity 0 and animate in",
  );
});

test("applyPatchToEditor adds to an existing board without touching existing shapes", async () => {
  const editor = lab.newEditor();
  lab.app.loadDiagramSpec(editor, { format: "whiteboard-studio/v1", nodes: [{ id: "old", label: "Old", x: 0, y: 0 }] });
  const before = editor.getCurrentPageShapes().map((shape) => ({ id: shape.id, opacity: shape.opacity }));
  await lab.app.applyPatchToEditor(editor, { patch: spec });
  for (const shape of before) assert.equal(editor.getShape(shape.id).opacity, shape.opacity);
  assert.equal(editor.getCurrentPageShapes().length, before.length + 4);
});
