import assert from "node:assert/strict";
import test from "node:test";
import { createLabEditor } from "./helpers/headless-editor.mjs";

const { app } = await createLabEditor();
const { mergeWorkspaceDocuments: merge } = app;
const doc = (id, updatedAt, extra = {}) => ({ id, title: id, project: "p", tags: [], status: "draft", nextStep: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt, ...extra });
const byId = (documents) => Object.fromEntries(documents.map((document) => [document.id, document]));

test("browser copy wins when it is at least as new as the agent copy", () => {
  const result = byId(merge([doc("a", "2026-01-01T00:00:00.000Z", { title: "agent" })], [], [doc("a", "2026-02-01T00:00:00.000Z", { title: "browser" })], ""));
  assert.equal(result.a.title, "browser");
  const tie = byId(merge([doc("a", "2026-02-01T00:00:00.000Z", { title: "agent" })], [], [doc("a", "2026-02-01T00:00:00.000Z", { title: "browser" })], ""));
  assert.equal(tie.a.title, "browser");
});

test("agent copy wins when it is newer than the browser copy", () => {
  const result = byId(merge([doc("a", "2026-03-01T00:00:00.000Z", { title: "agent" })], [], [doc("a", "2026-02-01T00:00:00.000Z", { title: "browser" })], ""));
  assert.equal(result.a.title, "agent");
  assert.equal(result.a.updatedAt, "2026-03-01T00:00:00.000Z");
});

test("documents known to only one side are all kept; shared overrides agent for the same id", () => {
  const result = byId(
    merge(
      [doc("a", "2026-01-01T00:00:00.000Z"), doc("b", "2026-01-01T00:00:00.000Z", { title: "agent-b" })],
      [doc("b", "2026-01-02T00:00:00.000Z", { title: "shared-b" }), doc("c", "2026-01-01T00:00:00.000Z")],
      [doc("d", "2026-01-01T00:00:00.000Z")],
      "",
    ),
  );
  assert.deepEqual(Object.keys(result).sort(), ["a", "b", "c", "d"]);
  assert.equal(result.b.title, "shared-b");
});

test("sourceUpdatedAt is taken from the agent copy when it has a sourceUrl", () => {
  const agent = doc("a", "2026-03-01T00:00:00.000Z", { sourceUrl: "https://example.test/a" });
  const result = byId(merge([agent], [], [doc("a", "2026-02-01T00:00:00.000Z", { sourceUpdatedAt: "2026-01-15T00:00:00.000Z" })], ""));
  assert.equal(result.a.sourceUpdatedAt, "2026-03-01T00:00:00.000Z");
});

test("a document with a sourceUrl but no sourceUpdatedAt gets its own updatedAt", () => {
  const result = byId(merge([], [doc("a", "2026-02-01T00:00:00.000Z", { sourceUrl: "https://example.test/a" })], [], ""));
  assert.equal(result.a.sourceUpdatedAt, "2026-02-01T00:00:00.000Z");
  const plain = byId(merge([], [doc("p", "2026-02-01T00:00:00.000Z")], [], ""));
  assert.equal("sourceUpdatedAt" in plain.p, false);
});

test("the open document is created when missing: untitled, or the live demo title for the demo id", () => {
  const untitled = byId(merge([], [], [], "td_new"));
  assert.equal(untitled.td_new.title, "Untitled");
  assert.equal(untitled.td_new.status, "draft");
  const demo = byId(merge([], [], [], "td_live_diagram_demo_v1"));
  assert.equal(demo.td_live_diagram_demo_v1.title, "Live diagram · User → Agent → Service → Response");
  const existing = byId(merge([doc("td_new", "2026-01-01T00:00:00.000Z", { title: "Kept" })], [], [], "td_new"));
  assert.equal(existing.td_new.title, "Kept");
  assert.deepEqual(merge([], [], [], ""), []);
});

// --- Persistence ownership: real createDocumentPusher / retrieveWorkspaceSources / pushCommittedDocuments ---
const { createDocumentPusher, retrieveWorkspaceSources, pushCommittedDocuments } = app;
const T1 = "2026-01-01T00:00:00.000Z",
  T2 = "2026-01-02T00:00:00.000Z",
  T3 = "2026-01-03T00:00:00.000Z";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
function harness(initialDocs = [], known = []) {
  const remoteUpdatedAt = new Map(known);
  const putsInFlight = new Map();
  const state = { docs: initialDocs };
  const sends = [];
  const pending = [];
  const push = createDocumentPusher({
    remoteUpdatedAt,
    putsInFlight,
    getDocuments: () => state.docs,
    send: (document) => {
      sends.push(document.updatedAt);
      const d = deferred();
      pending.push(d);
      return d.promise;
    },
  });
  return { remoteUpdatedAt, putsInFlight, state, sends, pending, push };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const jsonResponse = (body) => ({ ok: true, json: async () => body });

test("a failed or partial poll is incomplete and the persistence decision never PUTs", async () => {
  const docs = [doc("a", T2)];
  for (const fetchImpl of [
    async (url) => (url === "/api/workspace" ? { ok: false } : jsonResponse([])),
    async (url) => (url === "/workspace/index.json" ? { ok: false } : jsonResponse([])),
    async () => ({ ok: false }),
  ]) {
    const sources = await retrieveWorkspaceSources(fetchImpl);
    assert.equal(sources.complete, false);
    const h = harness(docs);
    pushCommittedDocuments(docs, sources.complete, h.push);
    await flush();
    assert.deepEqual(h.sends, []);
  }
  await assert.rejects(
    retrieveWorkspaceSources(async () => {
      throw new Error("offline");
    }),
  );
  const ok = await retrieveWorkspaceSources(async () => jsonResponse([]));
  assert.equal(ok.complete, true);
  const h = harness(docs);
  pushCommittedDocuments(docs, ok.complete, h.push);
  assert.deepEqual(h.sends, [T2]);
});

test("a version the server already has, or an older one, is not PUT again", async () => {
  const h = harness([], [["a", T2]]);
  await h.push(doc("a", T2));
  await h.push(doc("a", T1));
  assert.deepEqual(h.sends, []);
});

test("repeated identical versions produce one PUT while it is in flight and none after it succeeds", async () => {
  const h = harness();
  const d = doc("a", T1);
  const first = h.push(d);
  void h.push(d);
  void h.push(d);
  assert.deepEqual(h.sends, [T1]);
  h.pending[0].resolve();
  await first;
  assert.equal(h.remoteUpdatedAt.get("a"), T1);
  await h.push(d);
  assert.deepEqual(h.sends, [T1]);
});

test("a newer version committed during an in-flight write is re-pushed exactly once", async () => {
  const h = harness([doc("a", T1)]);
  const first = h.push(doc("a", T1));
  h.state.docs = [doc("a", T2)];
  void h.push(doc("a", T2));
  assert.deepEqual(h.sends, [T1]);
  h.pending[0].resolve();
  await first;
  assert.deepEqual(h.sends, [T1, T2]);
  h.pending[1].resolve();
  await flush();
  assert.deepEqual(h.sends, [T1, T2]);
  assert.equal(h.remoteUpdatedAt.get("a"), T2);
});

test("a failed PUT clears the in-flight mark without advancing the known version, so it can be retried", async () => {
  const h = harness();
  const failed = h.push(doc("a", T1));
  h.pending[0].reject(new Error("500"));
  await assert.rejects(failed);
  assert.equal(h.putsInFlight.has("a"), false);
  assert.equal(h.remoteUpdatedAt.has("a"), false);
  void h.push(doc("a", T1));
  assert.deepEqual(h.sends, [T1, T1]);
});

test("pushCommittedDocuments pushes every document after a complete poll and swallows send failures", async () => {
  const docs = [doc("a", T1), doc("b", T3)];
  const h = harness(docs);
  pushCommittedDocuments(docs, true, h.push);
  assert.deepEqual(h.sends, [T1, T3]);
  h.pending.forEach((d) => d.reject(new Error("x")));
  await flush();
});
