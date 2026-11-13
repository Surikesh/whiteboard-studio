import assert from "node:assert/strict";
import test from "node:test";
import { createTLSchema, defaultShapeSchemas, createShapeId } from "@tldraw/tlschema";
import { liveFrameMigrations, liveFrameProps } from "../app/live-diagram-schema.ts";

const schema = createTLSchema({
  shapes: {
    ...defaultShapeSchemas,
    "live-frame": { props: liveFrameProps, migrations: liveFrameMigrations },
  },
});
const richText = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Frame" }] }] };

test("a board saved without the live-frame sequence (earlier Tldraw Lab) keeps its bevel frame", () => {
  const frame = {
    id: createShapeId("frm"),
    typeName: "shape",
    type: "live-frame",
    parentId: "page:p",
    index: "a2",
    x: 0,
    y: 0,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    props: { w: 200, h: 100, richText, frame: "bevel" },
  };
  const persisted = schema.serialize();
  delete persisted.sequences["com.tldraw.shape.live-frame"];
  const result = schema.migrateStoreSnapshot({ store: { [frame.id]: frame }, schema: persisted });
  assert.equal(result.type, "success");
  assert.equal(schema.types.shape.validate(result.value[frame.id]).props.frame, "bevel");
});

test("a bevel frame saved at version 1 is kept, and a version 2 bevel is valid", () => {
  const frame = {
    id: createShapeId("frm1"),
    typeName: "shape",
    type: "live-frame",
    parentId: "page:p",
    index: "a2",
    x: 0,
    y: 0,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    props: { w: 200, h: 100, richText, frame: "bevel" },
  };
  const persisted = schema.serialize();
  assert.equal(persisted.sequences["com.tldraw.shape.live-frame"], 2);
  persisted.sequences["com.tldraw.shape.live-frame"] = 1;
  const result = schema.migrateStoreSnapshot({ store: { [frame.id]: frame }, schema: persisted });
  assert.equal(result.type, "success");
  assert.equal(schema.types.shape.validate(result.value[frame.id]).props.frame, "bevel");
});

test("a version 1 client receives bevel frames as mat", () => {
  const frame = schema.types.shape.create({ id: createShapeId("frm2"), type: "live-frame", parentId: "page:p", index: "a1", props: { w: 200, h: 100, richText, frame: "bevel" } });
  const older = schema.serialize();
  older.sequences["com.tldraw.shape.live-frame"] = 1;
  const result = schema.migratePersistedRecord(frame, older, "down");
  assert.equal(result.type, "success");
  assert.equal(result.value.props.frame, "mat");
});
