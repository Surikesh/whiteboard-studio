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

test("a snapshot with a bevel live-frame migrates to the mat frame and validates", () => {
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
  assert.equal(schema.types.shape.validate(result.value[frame.id]).props.frame, "mat");
});
