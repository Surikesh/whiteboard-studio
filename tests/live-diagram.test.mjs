import assert from "node:assert/strict";
import test from "node:test";
import { createTLSchema, defaultShapeSchemas, createShapeId } from "@tldraw/tlschema";
import { liveFrameMigrations, liveFrameProps } from "../app/live-diagram-schema.ts";

const schema = createTLSchema({ shapes: { ...defaultShapeSchemas, "live-frame": { props: liveFrameProps, migrations: liveFrameMigrations } } });
const richText = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Agent\nData" }] }] };
const make = (frame) => schema.types.shape.create({ id: createShapeId("frame-test"), type: "live-frame", parentId: "page:test", index: "a1", props: { w: 220, h: 120, richText, frame } });

test("frame variants and editable rich text survive validated JSON roundtrip", () => {
  for (const frame of ["plain", "mat"]) {
    const record = JSON.parse(JSON.stringify(make(frame)));
    assert.deepEqual(schema.types.shape.validate(record), record);
    assert.deepEqual(record.props.richText, richText);
  }
});

test("stored bevel frames open as mat", () => {
  const stored = JSON.parse(JSON.stringify(make("mat")));
  stored.props.frame = "bevel";
  const persisted = schema.serialize();
  delete persisted.sequences["com.tldraw.shape.live-frame"];
  const result = schema.migrateStoreSnapshot({ store: { [stored.id]: stored }, schema: persisted });
  assert.equal(result.type, "success");
  assert.equal(schema.types.shape.validate(result.value[stored.id]).props.frame, "mat");
  assert.deepEqual(result.value[stored.id].props.richText, richText);
});

test("frame schema rejects invalid styling and malformed text", () => {
  assert.throws(() => schema.types.shape.validate(make("neon")));
  assert.throws(() => schema.types.shape.validate({ ...make("mat"), props: { ...make("mat").props, richText: "raster text" } }));
});

test("saved activity metadata is additive; playback is not a shape property", () => {
  const shape = { ...make("mat"), meta: { liveActive: true, unrelated: "preserved" } };
  assert.deepEqual(schema.types.shape.validate(shape).meta, shape.meta);
  assert.equal("playing" in liveFrameProps, false);
  assert.equal("requested" in liveFrameProps, false);
  assert.equal(Object.keys(defaultShapeSchemas).includes("live-frame"), false);
});
