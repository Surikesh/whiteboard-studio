import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { guestMayReadAsset, isSharedBoardAsset } from "../scripts/lib/board-assets.mjs";
import { labStoragePlugin } from "../scripts/lab-storage-plugin.mjs";
import { agentRouteAccess, canonicalPath, isRemoteAssetName, isRemoteRequest } from "../scripts/lib/remote-request.mjs";

const UUID = "123e4567-e89b-42d3-a456-426614174000";
const JOB = "223e4567-e89b-42d3-a456-426614174001";
const TUNNEL = { "cf-connecting-ip": "203.0.113.9" };
const ROOM = "td_demo_web_architecture";

test("isRemoteRequest: any tunnel header or LAN socket is a guest; a loopback header value is never trusted", () => {
  const local = { headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  assert.equal(isRemoteRequest(local), false);
  assert.equal(isRemoteRequest({ headers: TUNNEL, socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isRemoteRequest({ headers: {}, socket: { remoteAddress: "192.168.1.5" } }), true);
  assert.equal(isRemoteRequest({ headers: { "cf-connecting-ip": "127.0.0.1" }, socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isRemoteRequest({ headers: { "cf-connecting-ip": "::1" }, socket: { remoteAddress: "::1" } }), true);
});

// A stored board is one SQLite file per Durable Object room (same layout Miniflare writes).
function writeBoard(dataDir, room, { assets = [], shapes = [] } = {}) {
  const dir = path.join(dataDir, "state", "v3", "do", "whiteboard-studio-TldrawDurableObject");
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, `${room}.sqlite`));
  db.exec("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, state BLOB NOT NULL, lastChangedClock INTEGER NOT NULL)");
  db.exec("DELETE FROM documents");
  const put = db.prepare("INSERT INTO documents (id, state, lastChangedClock) VALUES (?, ?, 1)");
  assets.forEach(([id, src]) => put.run(id, JSON.stringify({ id, typeName: "asset", type: "image", props: { src, name: "x", w: 1, h: 1, mimeType: "image/png", isAnimated: false }, meta: {} })));
  shapes.forEach((assetId, i) => put.run(`shape:s${i}`, JSON.stringify({ id: `shape:s${i}`, typeName: "shape", type: "image", props: { assetId, w: 1, h: 1 } })));
  db.close();
}

test("isSharedBoardAsset: reference by a board shape, relative or absolute src, freshness, deletion", async () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "lab-refs-"));
  const A = `${UUID}.png`;
  const B = `${JOB}-${UUID}.png`;
  assert.equal(await isSharedBoardAsset(dataDir, A), false, "no state dir at all");
  writeBoard(dataDir, "td_one", {
    assets: [
      ["asset:1", `/api/agent/assets/${A}`],
      ["asset:2", `https://x.trycloudflare.com/api/agent/assets/${B}?v=1`],
      ["asset:3", "/api/agent/assets/orphan.png"],
    ],
    shapes: ["asset:1", "asset:2"],
  });
  assert.equal(await isSharedBoardAsset(dataDir, A), true);
  assert.equal(await isSharedBoardAsset(dataDir, B), true, "absolute URL with query");
  assert.equal(await isSharedBoardAsset(dataDir, "orphan.png"), false, "asset record without an image shape");
  assert.equal(await isSharedBoardAsset(dataDir, "other.png"), false);
  // Freshness: an edit that removes the shape is visible on the very next check (no stale allow) ...
  writeBoard(dataDir, "td_one", { assets: [["asset:1", `/api/agent/assets/${A}`]], shapes: [] });
  assert.equal(await isSharedBoardAsset(dataDir, A), false);
  // ... and an edit that adds one is visible immediately too.
  writeBoard(dataDir, "td_one", { assets: [["asset:1", `/api/agent/assets/${A}`]], shapes: ["asset:1"] });
  assert.equal(await isSharedBoardAsset(dataDir, A), true);
  // A corrupt room file fails closed for its own content only.
  writeFileSync(path.join(dataDir, "state", "v3", "do", "whiteboard-studio-TldrawDurableObject", "bad.sqlite"), "not sqlite");
  assert.equal(await isSharedBoardAsset(dataDir, A), true);
  assert.equal(await isSharedBoardAsset(dataDir, "nope.png"), false);
  // Agent access on: unreferenced bridge-generated names are readable (approved deviation), other names are not.
  assert.equal(await guestMayReadAsset(dataDir, `${JOB}-${JOB}.png`, true), true);
  assert.equal(await guestMayReadAsset(dataDir, `${JOB}-${JOB}.png`, false), false);
  assert.equal(await guestMayReadAsset(dataDir, "config.json", true), false);
  assert.equal(await guestMayReadAsset(dataDir, A, false), true);
});

test("canonicalPath collapses encodings, slashes, dot segments and case", () => {
  assert.equal(canonicalPath("/api/lab/snapshot/x?y=1"), "/api/lab/snapshot/x");
  assert.equal(canonicalPath("/API/Lab/x"), "/api/lab/x");
  assert.equal(canonicalPath("/api/%6Cab/x"), "/api/lab/x");
  assert.equal(canonicalPath("/api/%256Cab/x"), "/api/lab/x");
  assert.equal(canonicalPath("/x/../api/lab/x"), "/api/lab/x");
  assert.equal(canonicalPath("/api//lab/x"), "/api/lab/x");
  assert.equal(canonicalPath("/api\\lab/x"), "/api/lab/x");
  assert.equal(canonicalPath("//api/lab/x"), "/api/lab/x");
  assert.equal(canonicalPath("api/lab"), null);
  assert.equal(canonicalPath("/%zz"), null);
  assert.equal(canonicalPath("/a%00b"), null);
});

test("remote asset names (agent-on grammar only) are flat uuid names with a media extension", () => {
  for (const ok of [`${UUID}.png`, `${JOB}-${UUID}.png`, `${UUID}.webm`]) assert.equal(isRemoteAssetName(ok), true, ok);
  for (const bad of ["config.json", "messages.json", "../x.png", `${UUID}.png/..`, `${UUID}.html`, `${UUID}`, ".agent-enabled", "a.png", `${UUID}.png\0`, ""])
    assert.equal(isRemoteAssetName(bad), false, bad);
});

test("agentRouteAccess table", () => {
  const routes = [
    ["GET", "/api/agent/status"],
    ["GET", "/api/agent/messages"],
    ["DELETE", "/api/agent/messages"],
    ["POST", "/api/agent/claim"],
    ["POST", "/api/agent/chat"],
    ["POST", "/api/agent/upload"],
  ];
  for (const [method, pathname] of routes) {
    assert.equal(agentRouteAccess({ method, pathname, remote: false, agentEnabled: false }), "allow", `local ${method} ${pathname}`);
    assert.equal(agentRouteAccess({ method, pathname, remote: true, agentEnabled: true }), "allow", `remote+enabled ${method} ${pathname}`);
    const disabled = agentRouteAccess({ method, pathname, remote: true, agentEnabled: false });
    assert.equal(disabled, pathname.endsWith("/status") ? "minimal" : "deny", `remote+disabled ${method} ${pathname}`);
  }
});

// ---- the real bridge process -------------------------------------------------

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function request(port, method, url, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function startBridge(t) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "lab-boundary-"));
  const port = await freePort();
  const appPort = await freePort(); // nothing listens: proxied requests answer 502, which proves "not handled by the bridge"
  const child = spawn(process.execPath, [path.resolve("scripts/agent-bridge.mjs")], {
    env: { ...process.env, WHITEBOARD_STUDIO_DATA_DIR: dataDir, AGENT_BRIDGE_PORT: String(port), AGENT_BRIDGE_HOST: "127.0.0.1", WHITEBOARD_STUDIO_APP_ORIGIN: `http://127.0.0.1:${appPort}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill("SIGTERM"));
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => String(d).includes("Agent bridge on") && resolve());
    child.once("exit", (code) => reject(new Error(`bridge exited ${code}`)));
  });
  return { port, dataDir };
}

test("bridge: remote guests are refused on every private route while agent access is disabled", async (t) => {
  const { port, dataDir } = await startBridge(t);
  writeFileSync(path.join(dataDir, "bridge", "agent-messages.json"), JSON.stringify([{ id: "m1", roomId: ROOM, role: "user", text: "SECRET-HISTORY", patch: { nodes: [] } }]));
  const assets = path.join(dataDir, "assets");
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(assets, `${UUID}.png`), "png-bytes");
  writeFileSync(path.join(assets, "private-notes.txt"), "PRIVATE");
  writeFileSync(path.join(assets, "legacy.png"), "legacy");
  writeFileSync(path.join(assets, `${JOB}.png`), "UNREFERENCED-UPLOAD");
  writeFileSync(path.join(assets, `${JOB}-${UUID}.png`), "board-generated");
  // Board references the uuid upload and a legacy-named file; the JOB upload is referenced by no board.
  writeBoard(dataDir, "td_demo_web_architecture", {
    assets: [
      ["asset:1", `/api/agent/assets/${UUID}.png`],
      ["asset:2", `/api/agent/assets/${JOB}-${UUID}.png`],
    ],
    shapes: ["asset:1", "asset:2"],
  });

  const json = { "content-type": "application/json" };
  const remote = (m, u, h = {}, b) => request(port, m, u, { ...TUNNEL, ...h }, b);
  const local = (m, u, h = {}, b) => request(port, m, u, h, b);

  // Local owner: history readable, claim works, delete works.
  const mine = await local("GET", `/api/agent/messages?roomId=${ROOM}`);
  assert.equal(mine.status, 200);
  assert.match(mine.body, /SECRET-HISTORY/);
  assert.equal((await local("GET", "/api/agent/status")).status, 200);
  assert.equal((await local("GET", `/api/agent/assets/${UUID}.png`)).body, "png-bytes");
  assert.equal((await local("GET", "/api/agent/assets/legacy.png")).body, "legacy");

  // Remote + agent disabled: nothing private leaks.
  for (const [m, u, h, b] of [
    ["GET", `/api/agent/messages?roomId=${ROOM}`],
    ["DELETE", `/api/agent/messages?roomId=${ROOM}`],
    ["POST", "/api/agent/claim", json, JSON.stringify({ id: "m1" })],
    ["POST", "/api/agent/chat", json, JSON.stringify({ roomId: ROOM, text: "hi" })],
    ["POST", "/api/agent/upload", { "x-file-name": "a.png" }, "x"],
    ["GET", "/api/lab/revisions?id=td_x"],
    ["GET", "/api/lab/snapshot/td_x.json"],
    ["GET", "/API/LAB/snapshot/td_x.json"],
    ["GET", "/api/%6Cab/snapshot/td_x.json"],
    ["GET", "/api/%256Cab/snapshot/td_x.json"],
    ["GET", "/x/../api/lab/snapshot/td_x.json"],
    ["GET", "//api/lab/snapshot/td_x.json"],
    ["GET", "/api//lab/snapshot/td_x.json"],
    ["GET", "/API/agent/messages?roomId=" + ROOM],
    ["GET", "/api/agent//messages?roomId=" + ROOM],
    ["GET", "/api/%61gent/messages?roomId=" + ROOM],
    ["GET", "/api/agent/./messages?roomId=" + ROOM],
  ]) {
    const r = await remote(m, u, h, b);
    assert.equal(r.status, 403, `${m} ${u}`);
    assert.doesNotMatch(r.body, /SECRET|PRIVATE|png-bytes|legacy/, `${m} ${u}`);
  }
  const status = await remote("GET", "/api/agent/status");
  assert.equal(status.status, 200);
  assert.deepEqual(JSON.parse(status.body), { enabled: false, chat: { configured: false } });

  // Assets: only files a stored board references; traversal, private and unreferenced files are not served.
  assert.equal((await remote("GET", `/api/agent/assets/${UUID}.png`)).body, "png-bytes");
  assert.equal((await remote("GET", `/api/agent/assets/${JOB}-${UUID}.png`)).body, "board-generated");
  assert.equal((await local("GET", `/api/agent/assets/${JOB}.png`)).body, "UNREFERENCED-UPLOAD");
  for (const u of [
    `/api/agent/assets/${JOB}.png`,
    "/api/agent/assets/private-notes.txt",
    "/api/agent/assets/legacy.png",
    "/api/agent/assets/",
    "/api/agent/assets",
    "/api/agent/assets/..%2Fmessages.json",
    "/api/agent/assets/%2e%2e%2fmessages.json",
    "/api/agent/assets/..%2f..%2fconfig.json",
    "/api/agent/assets/%2e%2e/messages.json",
    `/api/agent/assets/${UUID}.png%00`,
    "/api/agent/assets/.agent-enabled",
  ]) {
    const r = await remote("GET", u);
    assert.notEqual(r.status, 200, u);
    assert.doesNotMatch(r.body, /SECRET|PRIVATE|legacy|png-bytes|UNREFERENCED/, u);
  }

  // History is intact after all those attempts (delete/claim did not run).
  assert.match((await local("GET", `/api/agent/messages?roomId=${ROOM}`)).body, /SECRET-HISTORY/);
  assert.doesNotMatch(String(JSON.parse((await local("GET", `/api/agent/messages?roomId=${ROOM}`)).body).messages[0].claimedAt ?? ""), /\d/);

  // Remote + agent enabled: the owner opted in, agent routes work for guests, /api/lab stays local-only.
  writeFileSync(path.join(dataDir, "bridge", "agent-enabled"), "");
  assert.match(JSON.stringify(Object.keys(JSON.parse((await remote("GET", "/api/agent/status")).body))), /chat/);
  assert.match((await remote("GET", `/api/agent/messages?roomId=${ROOM}`)).body, /SECRET-HISTORY/);
  assert.equal((await remote("POST", "/api/agent/claim", json, JSON.stringify({ id: "m1" }))).status, 200);
  assert.equal((await remote("GET", "/api/lab/revisions?id=td_x")).status, 403);
  assert.equal((await remote("GET", "/api/agent/assets/legacy.png")).status, 404);
  // Approved deviation: with agent access on, guests also read unreferenced bridge-named uploads.
  assert.equal((await remote("GET", `/api/agent/assets/${JOB}.png`)).body, "UNREFERENCED-UPLOAD");
  assert.equal((await remote("DELETE", `/api/agent/messages?roomId=${ROOM}`)).status, 200);

  // Unrelated paths still reach the app (502: the stand has no app behind the bridge).
  assert.equal((await remote("GET", "/api/workspace")).status, 502);
});

// ---- the dev-server storage plugin ---------------------------------------------

test("storage plugin: guests get no revisions and only board-referenced assets; a loopback header value is still a guest", async (t) => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "lab-plugin-"));
  const previous = process.env.WHITEBOARD_STUDIO_DATA_DIR;
  process.env.WHITEBOARD_STUDIO_DATA_DIR = dataDir;
  t.after(() => (previous === undefined ? delete process.env.WHITEBOARD_STUDIO_DATA_DIR : (process.env.WHITEBOARD_STUDIO_DATA_DIR = previous)));
  mkdirSync(path.join(dataDir, "assets"), { recursive: true });
  mkdirSync(path.join(dataDir, "revisions", ROOM), { recursive: true });
  writeFileSync(path.join(dataDir, "assets", `${UUID}.png`), "png-bytes");
  writeFileSync(path.join(dataDir, "assets", "legacy.png"), "legacy");
  writeFileSync(path.join(dataDir, "assets", `${JOB}.png`), "UNREFERENCED-UPLOAD");
  writeBoard(dataDir, ROOM, { assets: [["asset:1", `/api/agent/assets/${UUID}.png`]], shapes: ["asset:1"] });
  writeFileSync(path.join(dataDir, "revisions", ROOM, "2026-01-01T00-00-00.000Z.tldr"), "REVISION");

  let middleware;
  labStoragePlugin().configureServer({ middlewares: { use: (fn) => (middleware = fn) }, httpServer: null });
  const call = (url, headers = {}, method = "GET") =>
    new Promise((resolve) => {
      const res = {
        statusCode: 200,
        writeHead(code) {
          this.statusCode = code;
        },
        end(body) {
          resolve({ status: this.statusCode, body: String(body ?? ""), passedOn: false });
        },
      };
      middleware({ url, method, headers, socket: { remoteAddress: "127.0.0.1" } }, res, () => resolve({ status: 0, body: "", passedOn: true }));
    });
  const stamped = { "cf-connecting-ip": "127.0.0.1" }; // spoofable; never trusted

  assert.match((await call(`/api/lab/revisions?id=${ROOM}`)).body, /2026-01-01/);
  assert.equal((await call(`/api/lab/revisions?id=${ROOM}`, stamped)).status, 403);
  for (const u of [
    `/api/lab/revisions?id=${ROOM}`,
    `/api/lab/revisions/${ROOM}/2026-01-01T00-00-00.000Z.tldr`,
    "/API/Lab/revisions?id=" + ROOM,
    "/api/%6Cab/revisions?id=" + ROOM,
    "//api/lab/revisions?id=" + ROOM,
  ]) {
    for (const method of ["GET", "POST"]) {
      const r = await call(u, TUNNEL, method);
      assert.equal(r.status, 403, `${method} ${u}`);
      assert.doesNotMatch(r.body, /REVISION|2026/);
    }
  }
  assert.equal((await call(`/api/agent/assets/${UUID}.png`, TUNNEL)).body, "png-bytes");
  assert.equal((await call(`/api/agent/assets/${UUID}.png`, stamped)).body, "png-bytes");
  assert.equal((await call(`/api/agent/assets/${JOB}.png`)).body, "UNREFERENCED-UPLOAD");
  assert.notEqual((await call(`/api/agent/assets/${JOB}.png`, TUNNEL)).body, "UNREFERENCED-UPLOAD");
  assert.notEqual((await call(`/api/agent/assets/${JOB}.png`, stamped)).body, "UNREFERENCED-UPLOAD");
  assert.equal((await call("/api/agent/assets/legacy.png")).body, "legacy");
  for (const u of ["/api/agent/assets/legacy.png", "/api/agent/assets/..%2Fconfig.json", "/api/agent/assets/%2e%2e%2fconfig.json", "/api/agent/assets/"]) {
    const r = await call(u, TUNNEL);
    assert.notEqual(r.body, "legacy", u);
    assert.ok(r.status !== 200, u);
  }
});
