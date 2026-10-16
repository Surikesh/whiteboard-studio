import assert from "node:assert/strict";
import test from "node:test";
import { loadAppModule } from "./helpers/load-app.mjs";

// Adapter-level characterization: real IO exports, manually supplied committed refs/maps.
// No React hook, effect scheduling, or GET dispatcher is exercised here.
const { createDocumentPusher, mergeWorkspaceDocuments, pushCommittedDocuments } = await loadAppModule("app/io/workspace-storage.ts");
const doc = (id, updatedAt) => ({ id, updatedAt, title: id });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function harness() {
  const remoteUpdatedAt = new Map(),
    putsInFlight = new Map();
  const state = { committed: [] },
    sends = [],
    pending = [];
  const push = createDocumentPusher({
    remoteUpdatedAt,
    putsInFlight,
    getDocuments: () => state.committed,
    send: (value) => {
      sends.push(value);
      const next = deferred();
      pending.push(next);
      return next.promise;
    },
  });
  return { remoteUpdatedAt, putsInFlight, state, sends, pending, push };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("adapter parity: in-flight dedupe resolves immediately; different IDs send independently", async () => {
  const h = harness(),
    first = h.push(doc("a", "1"));
  await h.push(doc("a", "2"));
  const other = h.push(doc("b", "1"));
  assert.deepEqual(h.sends, [doc("a", "1"), doc("b", "1")]);
  h.state.committed = [doc("a", "3")];
  h.pending[0].resolve();
  await first;
  assert.deepEqual(h.sends.at(-1), doc("a", "3"));
  h.pending[1].resolve();
  h.pending[2].resolve();
  await other;
  await flush();
  assert.equal(h.remoteUpdatedAt.get("a"), "3");
});

test("adapter parity: merge + simulated poll map replacement during PUT; ACK keeps newer knowledge", async () => {
  const h = harness(),
    first = h.push(doc("a", "1"));
  const merged = mergeWorkspaceDocuments([], [doc("a", "3")], [doc("a", "2")], "");
  assert.equal(merged[0].updatedAt, "3");
  // Model the existing complete-poll map replacement, not a new poll scheduler.
  h.remoteUpdatedAt.clear();
  h.remoteUpdatedAt.set("a", "3");
  h.state.committed = merged;
  h.pending[0].resolve();
  await first;
  assert.equal(h.remoteUpdatedAt.get("a"), "3");
  assert.equal(h.sends.length, 1);
});

test("adapter parity: rejected/lost ACK clears mark; simulated GET knowledge suppresses resend", async () => {
  const h = harness(),
    first = h.push(doc("a", "1"));
  h.state.committed = [doc("a", "2")];
  h.pending[0].reject(new Error("response lost"));
  await assert.rejects(first, /response lost/);
  assert.equal(h.putsInFlight.size, 0);
  assert.equal(h.remoteUpdatedAt.size, 0);
  assert.equal(h.sends.length, 1);
  h.remoteUpdatedAt.set("a", "2");
  await h.push(doc("a", "2"));
  assert.equal(h.sends.length, 1);
});

test("adapter parity: never-settling PUT stays blocked after simulated poll map replacement", async () => {
  const h = harness();
  void h.push(doc("a", "1"));
  h.remoteUpdatedAt.clear();
  await h.push(doc("a", "2"));
  assert.equal(h.putsInFlight.get("a"), "1");
  assert.equal(h.sends.length, 1);
  h.pending[0].resolve();
  await flush();
});

test("adapter parity: failed recursive and automatic sends remain swallowed, no retry loop", async () => {
  const h = harness(),
    first = h.push(doc("a", "1"));
  h.state.committed = [doc("a", "2")];
  h.pending[0].resolve();
  await first;
  h.pending[1].reject(new Error("follow-up failed"));
  await flush();
  assert.equal(h.remoteUpdatedAt.get("a"), "1");
  assert.equal(h.putsInFlight.size, 0);
  pushCommittedDocuments([doc("a", "2")], false, h.push);
  assert.equal(h.sends.length, 2);
  pushCommittedDocuments([doc("a", "2")], true, h.push);
  h.pending[2].reject(new Error("automatic failed"));
  await flush();
  assert.equal(h.sends.length, 3);
  assert.equal(h.putsInFlight.size, 0);
});
