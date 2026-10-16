import assert from "node:assert/strict";
import test from "node:test";
import { createLabEditor } from "./helpers/headless-editor.mjs";

const { app } = await createLabEditor();

function installStorage({ quota = Infinity } = {}) {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      if ([...data.values()].join("").length + value.length > quota) throw new Error("QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key) => data.delete(key),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  return data;
}

const component = { id: "c1", name: "Box", createdAt: "2026-01-01T00:00:00.000Z", shapes: [{ type: "geo", x: 1, y: 2, rotation: 0, opacity: 1, props: { w: 10 }, meta: {} }] };

test("the component library uses its versioned localStorage key", () => {
  assert.equal(app.COMPONENT_LIBRARY_KEY, "tldraw-workspace/component-library/v1");
});

test("saved components round-trip through safeSetLocalStorage and readSavedComponents", () => {
  installStorage();
  assert.deepEqual(app.readSavedComponents(), []);
  assert.equal(app.safeSetLocalStorage(app.COMPONENT_LIBRARY_KEY, JSON.stringify([component])), true);
  assert.deepEqual(app.readSavedComponents(), [component]);
  const next = [{ ...component, id: "c2" }, component];
  app.safeSetLocalStorage(app.COMPONENT_LIBRARY_KEY, JSON.stringify(next));
  assert.deepEqual(
    app.readSavedComponents().map((item) => item.id),
    ["c2", "c1"],
  );
});

test("readSavedComponents returns an empty list for corrupt stored JSON", () => {
  const data = installStorage();
  data.set(app.COMPONENT_LIBRARY_KEY, "{not json");
  assert.deepEqual(app.readSavedComponents(), []);
});

test("safeSetLocalStorage reports a failed write instead of throwing, and keeps the old value", (context) => {
  const data = installStorage({ quota: 40 });
  context.mock.method(console, "warn", () => undefined);
  assert.equal(app.safeSetLocalStorage("k", "small"), true);
  assert.equal(app.safeSetLocalStorage("k2", "x".repeat(100)), false);
  assert.equal(data.get("k"), "small");
  assert.equal(data.has("k2"), false);
});

test("workspace documents use the same safe local backup", () => {
  installStorage();
  const document = { id: "td_a", title: "A", project: "p", tags: [], status: "draft", nextStep: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  assert.deepEqual(app.readDocuments(), []);
  app.writeDocuments([document]);
  assert.deepEqual(app.readDocuments(), [document]);
});
