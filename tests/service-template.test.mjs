import assert from "node:assert/strict";
import test from "node:test";
import { bindingsFrom, createLabEditor, shapesOfType } from "./helpers/headless-editor.mjs";

const lab = await createLabEditor();

test("service architecture template creates a title, three service cards, a database ellipse and three arrows with unique ids", () => {
  const editor = lab.newEditor();
  lab.app.addServiceArchitecture(editor);
  const shapes = editor.getCurrentPageShapes();
  assert.equal(new Set(shapes.map((shape) => shape.id)).size, shapes.length);
  const services = shapesOfType(editor, "service-card");
  const arrows = shapesOfType(editor, "arrow");
  assert.equal(services.length, 3);
  assert.equal(arrows.length, 3);
  assert.equal(shapesOfType(editor, "geo").length, 1);
  assert.equal(shapesOfType(editor, "text").length, 1);
  assert.equal(shapes.length, 8);
});

test("service architecture template: every binding joins an arrow to a service card or the database, one start and one end per arrow", () => {
  const editor = lab.newEditor();
  lab.app.addServiceArchitecture(editor);
  const arrows = shapesOfType(editor, "arrow");
  const bindings = bindingsFrom(editor, arrows);
  assert.equal(bindings.length, arrows.length * 2);
  for (const binding of bindings) {
    assert.equal(editor.getShape(binding.fromId).type, "arrow");
    assert.ok(["service-card", "geo"].includes(editor.getShape(binding.toId).type));
  }
  for (const arrow of arrows)
    assert.deepEqual(
      bindingsFrom(editor, [arrow])
        .map((binding) => binding.props.terminal)
        .sort(),
      ["end", "start"],
    );
});

test("service architecture template: service cards and the database do not overlap", () => {
  const editor = lab.newEditor();
  lab.app.addServiceArchitecture(editor);
  const boxes = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.type === "service-card" || shape.type === "geo")
    .map((shape) => ({ id: shape.id, x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h }));
  for (const [index, a] of boxes.entries())
    for (const b of boxes.slice(index + 1)) {
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false, `${a.id} overlaps ${b.id}`);
    }
});

test("service architecture template selects the three service cards and the database", () => {
  const editor = lab.newEditor();
  lab.app.addServiceArchitecture(editor);
  assert.equal(editor.getSelectedShapeIds().length, 4);
});
