import assert from "node:assert/strict";
import test from "node:test";
import { POLICY, initialState, publicView, step } from "../scripts/lib/share-policy.mjs";

const URL = "https://a-b-c.trycloudflare.com";

// Drives the policy with a fake clock and records the actions it asks for.
function machine() {
  let state = initialState();
  let now = 1_000_000;
  const actions = [];
  const send = (event) => {
    const result = step(state, { now, ...event });
    state = result.state;
    actions.push(...result.actions);
    return result.actions;
  };
  return {
    send,
    advance: (ms) => {
      now += ms;
      send({ type: "tick" });
    },
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    actions,
    up() {
      send({ type: "enable" });
      send({ type: "url", url: URL });
      send({ type: "probe", ok: true, localDns: true });
    },
  };
}

test("enable spawns cloudflared once; a second enable changes nothing", () => {
  const m = machine();
  assert.deepEqual(m.send({ type: "enable" }), ["spawn"]);
  assert.equal(m.state.status, "starting");
  const before = m.state;
  assert.deepEqual(m.send({ type: "enable" }), []);
  assert.equal(m.state, before);
});

test("the link is ready only after the public URL answers and the local resolver knows it", () => {
  const m = machine();
  m.send({ type: "enable" });
  m.send({ type: "probe", ok: true, localDns: true });
  assert.equal(m.state.status, "starting", "no URL yet");
  m.send({ type: "url", url: URL });
  m.send({ type: "probe", ok: true, localDns: false });
  assert.equal(m.state.status, "starting", "public works, local DNS not yet");
  assert.equal(publicView(m.state).linkReady, false);
  m.send({ type: "probe", ok: true, localDns: true });
  assert.equal(m.state.status, "ready");
  assert.equal(publicView(m.state).linkReady, true);
});

test("a link that answers through public DNS is announced after the local DNS wait even if the Mac's cache lags", () => {
  const m = machine();
  m.send({ type: "enable" });
  m.send({ type: "url", url: URL });
  m.send({ type: "probe", ok: true, localDns: false });
  m.advance(POLICY.systemDnsWaitMs - 1);
  m.send({ type: "probe", ok: true, localDns: false });
  assert.equal(m.state.status, "starting");
  m.advance(1);
  m.send({ type: "probe", ok: true, localDns: false });
  assert.equal(m.state.status, "ready");
});

test("failures inside the start grace period never trigger a restart", () => {
  const m = machine();
  m.send({ type: "enable" });
  m.send({ type: "url", url: URL });
  for (let i = 0; i < 17; i++) {
    m.send({ type: "probe", ok: false });
    m.advance(5_000);
  }
  assert.ok(m.now - 1_000_000 < POLICY.graceMs);
  assert.deepEqual(m.actions, ["spawn"]);
  assert.equal(m.state.failures, 0);
});

test("after a wake: 90 s grace, then three new consecutive failures before a restart", () => {
  const m = machine();
  m.up();
  m.advance(10 * 60_000);
  m.send({ type: "probe", ok: false }); // one old failure before the sleep
  assert.equal(m.state.failures, 1);
  m.send({ type: "wake" });
  assert.equal(m.state.status, "checking");
  assert.equal(m.state.failures, 0, "old failures do not count after a wake");
  for (let t = 0; t < POLICY.graceMs; t += 10_000) {
    m.send({ type: "probe", ok: false });
    m.advance(10_000);
  }
  assert.equal(m.state.failures, 0);
  m.send({ type: "probe", ok: false });
  m.send({ type: "probe", ok: false });
  assert.equal(m.state.status, "degraded");
  assert.deepEqual(m.actions, ["spawn", "probe"]);
  m.send({ type: "probe", ok: false });
  assert.deepEqual(m.actions, ["spawn", "probe", "kill", "spawn"]);
  assert.equal(m.state.status, "starting");
});

test("a success between failures starts the count again", () => {
  const m = machine();
  m.up();
  m.advance(POLICY.graceMs);
  m.send({ type: "probe", ok: false });
  m.send({ type: "probe", ok: false });
  m.send({ type: "probe", ok: true, localDns: true });
  m.send({ type: "probe", ok: false });
  m.send({ type: "probe", ok: false });
  assert.equal(m.state.status, "degraded");
  assert.deepEqual(m.actions, ["spawn"]);
});

test("restarts back off 30/60/120 s and give up after three in 15 minutes", () => {
  const m = machine();
  m.up();
  m.advance(POLICY.graceMs);
  const failPastGrace = () => {
    m.advance(POLICY.graceMs);
    m.send({ type: "probe", ok: false });
    m.send({ type: "probe", ok: false });
    m.send({ type: "probe", ok: false });
  };
  const spawns = () => m.actions.filter((a) => a === "spawn").length;
  failPastGrace();
  assert.equal(spawns(), 2, "first restart is immediate");
  assert.equal(m.state.nextRestartAt - m.now, 30_000);
  // grace (90 s) > 30 s backoff, so the second restart is not delayed.
  failPastGrace();
  assert.equal(spawns(), 3);
  assert.equal(m.state.nextRestartAt - m.now, 60_000);
  failPastGrace();
  assert.equal(spawns(), 4);
  assert.equal(m.state.nextRestartAt - m.now, 120_000);
  failPastGrace();
  assert.equal(spawns(), 4);
  assert.equal(m.state.status, "gave-up");
  // Probes keep running; a working link brings it back without a restart.
  m.send({ type: "url", url: URL });
  m.send({ type: "probe", ok: true, localDns: true });
  assert.equal(m.state.status, "ready");
});

test("a dead cloudflared inside the backoff waits for it; the restart then runs from tick", () => {
  const m = machine();
  m.up();
  m.send({ type: "exited" });
  assert.deepEqual(m.actions, ["spawn", "kill", "spawn"]);
  m.advance(5_000);
  m.send({ type: "exited" });
  assert.equal(m.state.status, "restarting");
  assert.deepEqual(m.actions, ["spawn", "kill", "spawn"]);
  m.advance(20_000);
  assert.equal(m.state.status, "restarting");
  m.advance(5_000);
  assert.equal(m.state.status, "starting");
  assert.deepEqual(m.actions, ["spawn", "kill", "spawn", "kill", "spawn"]);
  assert.equal(m.state.nextRestartAt - m.now, 60_000);
});

test("user actions never reset the backoff: restart, off/on and repeated enable wait for it", () => {
  const m = machine();
  m.up();
  m.send({ type: "exited" }); // restart #1, next allowed in 30 s
  m.send({ type: "url", url: URL });
  m.advance(1_000);
  m.send({ type: "restart" });
  assert.equal(m.state.status, "restarting", "manual restart waits for the backoff");
  m.send({ type: "restart" });
  m.send({ type: "enable" });
  assert.equal(m.state.nextRestartAt - m.now, 29_000);
  m.send({ type: "disable" });
  m.send({ type: "enable" });
  assert.equal(m.state.status, "restarting", "off and on again also waits");
  assert.equal(m.actions.filter((a) => a === "spawn").length, 2);
  m.advance(29_000);
  assert.equal(m.state.status, "starting");
  assert.equal(m.actions.filter((a) => a === "spawn").length, 3);
});

test("a manual restart after giving up is allowed once the backoff passed", () => {
  const m = machine();
  m.up();
  for (let i = 0; i < 3; i++) {
    m.advance(POLICY.graceMs);
    m.send({ type: "exited" });
    m.advance(130_000);
  }
  m.advance(POLICY.graceMs);
  m.send({ type: "exited" });
  assert.equal(m.state.status, "gave-up");
  m.send({ type: "restart" });
  assert.equal(m.state.status, "starting");
});

test("while a restart waits, a recovered old process is kept", () => {
  const m = machine();
  m.up();
  m.advance(POLICY.graceMs);
  m.send({ type: "exited" }); // immediate restart #1
  m.send({ type: "url", url: URL });
  m.send({ type: "probe", ok: true, localDns: true });
  m.advance(POLICY.graceMs - 80_000);
  m.send({ type: "restart" }); // inside the 30 s backoff? no: 10 s elapsed, so it waits
  assert.equal(m.state.status, "restarting");
  m.send({ type: "probe", ok: true, localDns: true });
  assert.equal(m.state.status, "ready");
  m.advance(60_000);
  assert.equal(m.state.status, "ready", "the cancelled restart does not run later");
});

test("disable kills cloudflared and hides the link", () => {
  const m = machine();
  m.up();
  assert.deepEqual(m.send({ type: "disable" }), ["kill"]);
  assert.equal(publicView(m.state).url, null);
  assert.deepEqual(m.send({ type: "probe", ok: true, localDns: true }), []);
  assert.equal(m.state.status, "off");
});
