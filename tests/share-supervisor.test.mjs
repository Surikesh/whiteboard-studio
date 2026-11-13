import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureDataDirs, labPaths } from "../scripts/lib/lab-config.mjs";
import http from "node:http";
import { getStatus, readShareState, startShareSupervisor, supervisorAlive } from "../scripts/lib/share-supervisor.mjs";

const config = { share: { cloudflareTunnelToken: "", cloudflarePublicUrl: "" } };

// A stand-in for cloudflared: prints a fresh quick-tunnel URL and stays up until killed.
function fakeTunnel(spawned, { ignoreTerm = false } = {}) {
  return () => {
    const n = spawned.length + 1;
    const trap = ignoreTerm ? `process.on("SIGTERM", () => {});` : "";
    const child = spawn(process.execPath, ["-e", `${trap} console.error("|  https://fake-${n}.trycloudflare.com  |"); setInterval(() => {}, 1000);`], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    spawned.push(child);
    return child;
  };
}

async function until(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("condition not reached");
}

test("supervisor: intent switch starts the tunnel, a killed cloudflared is replaced, off stops it", { timeout: 30_000 }, async () => {
  const paths = labPaths(mkdtempSync(path.join(os.tmpdir(), "share-sup-")));
  ensureDataDirs(paths);
  const spawned = [];
  const probe = async ({ url }) => (url ? { ok: true, localDns: true } : { ok: false, localDns: false });
  const supervisor = startShareSupervisor({ paths, config, origin: "http://127.0.0.1:1", spawnTunnel: fakeTunnel(spawned), probe });
  try {
    assert.equal(readShareState(paths).status, "off");
    assert.ok(supervisorAlive(readShareState(paths)));

    writeFileSync(paths.shareIntent, "");
    const first = await until(() => readShareState(paths)?.linkReady && readShareState(paths));
    assert.equal(first.url, "https://fake-1.trycloudflare.com");

    process.kill(-spawned[0].pid, "SIGKILL"); // cloudflared dies: the lab keeps running, the link comes back
    const second = await until(() => readShareState(paths)?.url === "https://fake-2.trycloudflare.com" && readShareState(paths)?.linkReady && readShareState(paths));
    assert.equal(second.restartsInWindow, 1);
    assert.equal(spawned.length, 2);

    rmSync(paths.shareIntent);
    await until(() => readShareState(paths)?.status === "off");
    await until(() => spawned[1].exitCode !== null || spawned[1].signalCode);
    assert.equal(readShareState(paths).url, null);
  } finally {
    await supervisor.stop();
  }
  assert.equal(existsSync(paths.shareState), false, "stop removes the state file");
  for (const child of spawned) assert.ok(child.exitCode !== null || child.signalCode, "no cloudflared left behind");
});

test("supervisor: stop() kills a cloudflared that ignores SIGTERM before the launcher gives up", { timeout: 20_000 }, async () => {
  const paths = labPaths(mkdtempSync(path.join(os.tmpdir(), "share-sup-")));
  ensureDataDirs(paths);
  const spawned = [];
  const probe = async ({ url }) => (url ? { ok: true, localDns: true } : { ok: false, localDns: false });
  const supervisor = startShareSupervisor({ paths, config, origin: "http://127.0.0.1:1", spawnTunnel: fakeTunnel(spawned, { ignoreTerm: true }), probe });
  writeFileSync(paths.shareIntent, "");
  await until(() => readShareState(paths)?.linkReady);
  await new Promise((resolve) => setTimeout(resolve, 300)); // let the child install its SIGTERM trap
  const started = Date.now();
  await supervisor.stop();
  assert.ok(Date.now() - started < 2_500, "stop() finishes inside the launcher's 2.5 s");
  await until(() => spawned[0].exitCode !== null || spawned[0].signalCode, 1_000);
  assert.equal(spawned[0].signalCode, "SIGKILL");
});

test("supervisor: a probe that was running across a sleep is discarded, the wake grace applies", { timeout: 20_000 }, async () => {
  const paths = labPaths(mkdtempSync(path.join(os.tmpdir(), "share-sup-")));
  ensureDataDirs(paths);
  const spawned = [];
  let clock = 1_000_000;
  let hold = false;
  let release = null;
  const probe = ({ url }) => {
    if (hold) return new Promise((resolve) => (release = resolve));
    return Promise.resolve(url ? { ok: true, localDns: true } : { ok: false, localDns: false });
  };
  const supervisor = startShareSupervisor({ paths, config, origin: "http://127.0.0.1:1", spawnTunnel: fakeTunnel(spawned), probe, now: () => clock });
  const step = async () => {
    clock += 2_000;
    supervisor.tick();
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  try {
    writeFileSync(paths.shareIntent, "");
    for (let i = 0; i < 200 && !supervisor.state().linkReady; i++) await step();
    assert.ok(supervisor.state().linkReady);
    for (let i = 0; i < 50; i++) await step(); // past the start grace period
    hold = true;
    for (let i = 0; i < 20 && !release; i++) await step();
    assert.ok(release, "a probe is in flight");
    clock += 10 * 60_000; // the Mac slept while the probe hung
    release({ ok: false, localDns: false, error: "stale" });
    await new Promise((resolve) => setImmediate(resolve));
    const view = supervisor.state();
    assert.equal(view.failures, 0, "the stale failure does not count");
    assert.equal(view.status, "checking");
    assert.ok(view.graceUntil >= clock + 89_000, "a fresh wake grace started");
  } finally {
    await supervisor.stop();
  }
});

test("getStatus settles when a response is cut off or stalls after its headers", { timeout: 10_000 }, async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "content-length": "100" });
    res.write("partial");
    if (req.url === "/cut") setTimeout(() => res.socket.destroy(), 50);
    // "/stall" never finishes
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const cut = await getStatus(`${base}/cut`, { timeoutMs: 3_000 });
    assert.equal(cut.status, 0);
    const started = Date.now();
    const stalled = await getStatus(`${base}/stall`, { timeoutMs: 500 });
    assert.equal(stalled.status, 0);
    assert.ok(Date.now() - started < 2_000);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
