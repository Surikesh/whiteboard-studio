import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureDataDirs, labPaths } from "../scripts/lib/lab-config.mjs";
import { readShareState, startShareSupervisor, supervisorAlive } from "../scripts/lib/share-supervisor.mjs";

const config = { share: { cloudflareTunnelToken: "", cloudflarePublicUrl: "" } };

// A stand-in for cloudflared: prints a fresh quick-tunnel URL and stays up until killed.
function fakeTunnel(spawned) {
  return () => {
    const n = spawned.length + 1;
    const child = spawn(process.execPath, ["-e", `console.error("|  https://fake-${n}.trycloudflare.com  |"); setInterval(() => {}, 1000);`], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
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
