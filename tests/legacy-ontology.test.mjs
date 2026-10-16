import assert from "node:assert/strict";
import test from "node:test";
import { createTLSchema, defaultShapeSchemas, createShapeId } from "@tldraw/tlschema";
import { T } from "@tldraw/validate";
import { liveFrameMigrations, liveFrameProps } from "../app/live-diagram-schema.ts";

const box = { w: T.number, h: T.number };
const schema = createTLSchema({
  shapes: {
    ...defaultShapeSchemas,
    "live-frame": { props: liveFrameProps, migrations: liveFrameMigrations },
    "ontology-node": { props: { ...box, kind: T.string, label: T.string, properties: T.string } },
  },
});
const richText = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Frame" }] }] };

test("legacy snapshot with ontology-node and bevel live-frame migrates and validates", () => {
  const node = {
    id: createShapeId("onto"),
    typeName: "shape",
    type: "ontology-node",
    parentId: "page:p",
    index: "a1",
    x: 0,
    y: 0,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    props: { w: 220, h: 250, kind: "customer", label: "Customer", properties: "name, email" },
  };
  const frame = { ...node, id: createShapeId("frm"), type: "live-frame", index: "a2", props: { w: 200, h: 100, richText, frame: "bevel" } };
  const persisted = schema.serialize();
  delete persisted.sequences["com.tldraw.shape.live-frame"];
  const result = schema.migrateStoreSnapshot({ store: { [node.id]: node, [frame.id]: frame }, schema: persisted });
  assert.equal(result.type, "success");
  assert.equal(result.value[node.id].id, node.id);
  assert.equal(schema.types.shape.validate(result.value[node.id]).props.label, "Customer");
  assert.equal(schema.types.shape.validate(result.value[frame.id]).props.frame, "mat");
});
