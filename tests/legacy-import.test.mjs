import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { defaultConfig, labPaths } from "../scripts/lib/lab-config.mjs";
import { durableObjectId, importFiles, importRooms, importWorkspace, mergeLegacyConfig, processesUsing, uniqueKeyFor } from "../scripts/lib/legacy-import.mjs";
import { readUserIndex } from "../scripts/lib/workspace-overlay.mjs";

const projectDir = path.resolve(import.meta.dirname, "..");
const tmp = (prefix) => mkdtempSync(path.join(os.tmpdir(), prefix));
const OLD_KEY = "tldraw-lab-TldrawDurableObject";

/** A room database the way Miniflare leaves it: the name table plus some data, in WAL mode and still open. */
function makeRoom(stateDir, room, rows = 3) {
  const dir = path.join(stateDir, "v3", "do", OLD_KEY);
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, `${durableObjectId(OLD_KEY, room)}.sqlite`));
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE __miniflare_do_name (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE documents (id TEXT, data TEXT)");
  db.prepare("INSERT INTO __miniflare_do_name (name) VALUES (?)").run(room);
  for (let i = 0; i < rows; i++) db.prepare("INSERT INTO documents VALUES (?, ?)").run(`doc${i}`, "x".repeat(100));
  return db;
}

test("the Durable Object id matches Miniflare's idFromName", () => {
  // Known pair taken from a real Miniflare state folder of the earlier app (the shared workspace index room).
  assert.equal(durableObjectId(OLD_KEY, "__workspace-index__"), "afeb311a419291aa470bf0d5e20f5822af1b0e1eddf21bd2969f15819d76e800");
  assert.equal(uniqueKeyFor("whiteboard-studio"), "whiteboard-studio-TldrawDurableObject");
});

test("rooms are copied under their new id, WAL content included, and never replaced without overwrite", async () => {
  const from = tmp("legacy-state-");
  const to = tmp("new-state-");
  const open = makeRoom(from, "td_board1", 5); // left open: the WAL is not checkpointed
  const nameless = path.join(from, "v3", "do", OLD_KEY, `${"0".repeat(64)}.sqlite`);
  new DatabaseSync(nameless).close();
  const newKey = uniqueKeyFor("whiteboard-studio");

  const dry = await importRooms({ fromState: from, toState: to, newUniqueKey: newKey, dryRun: true });
  assert.deepEqual(dry.copied, ["td_board1"]);
  assert.equal(existsSync(path.join(to, "v3")), false);

  const report = await importRooms({ fromState: from, toState: to, newUniqueKey: newKey });
  assert.deepEqual(report.copied, ["td_board1"]);
  assert.deepEqual(report.unnamed, ["0".repeat(64)]);
  assert.deepEqual(report.mismatched, []);
  const target = path.join(to, "v3", "do", newKey, `${durableObjectId(newKey, "td_board1")}.sqlite`);
  const copy = new DatabaseSync(target, { readOnly: true });
  assert.equal(copy.prepare("SELECT count(*) AS n FROM documents").get().n, 5);
  assert.equal(copy.prepare("SELECT name FROM __miniflare_do_name").get().name, "td_board1");
  copy.close();

  open.prepare("INSERT INTO documents VALUES ('later', '')").run();
  const again = await importRooms({ fromState: from, toState: to, newUniqueKey: newKey });
  assert.deepEqual(again.skipped, ["td_board1"]);
  const forced = await importRooms({ fromState: from, toState: to, newUniqueKey: newKey, overwrite: true });
  assert.deepEqual(forced.copied, ["td_board1"]);
  const updated = new DatabaseSync(target, { readOnly: true });
  assert.equal(updated.prepare("SELECT count(*) AS n FROM documents").get().n, 6);
  updated.close();
  open.close();
});

test("board list and specs go to the user's data; demo ids and names stay demos; old specs get the current format", () => {
  const repo = tmp("legacy-repo-");
  const paths = labPaths(tmp("new-data-"));
  mkdirSync(path.join(repo, "public", "workspace"), { recursive: true });
  mkdirSync(path.join(repo, "public", "diagrams"), { recursive: true });
  const demoId = JSON.parse(readFileSync(path.join(projectDir, "public/workspace/index.json"), "utf8"))[0].id;
  writeFileSync(
    path.join(repo, "public/workspace/index.json"),
    JSON.stringify([
      { id: "td_mine", title: "Mine", sourceUrl: "/diagrams/td_mine.diagram.json" },
      { id: demoId, title: "Old demo" },
    ]),
  );
  writeFileSync(path.join(repo, "public/diagrams/td_mine.diagram.json"), JSON.stringify({ format: "tldraw-lab/v1", title: "Mine", nodes: [{ id: "a", label: "A", x: 0, y: 0 }], edges: [] }));
  writeFileSync(path.join(repo, "public/diagrams/example.diagram.json"), "{}");

  const report = importWorkspace({ fromRepo: repo, projectDir, paths });
  assert.deepEqual(report.boards.added, ["td_mine"]);
  assert.deepEqual(report.boards.demo, [demoId]);
  assert.deepEqual(report.specs.copied, ["td_mine.diagram.json"]);
  assert.deepEqual(report.specs.demo, ["example.diagram.json"]);
  assert.deepEqual(
    readUserIndex(paths).map((item) => item.id),
    ["td_mine"],
  );
  assert.equal(JSON.parse(readFileSync(path.join(paths.diagrams, "td_mine.diagram.json"), "utf8")).format, "whiteboard-studio/v1");

  const again = importWorkspace({ fromRepo: repo, projectDir, paths });
  assert.deepEqual(again.boards.kept, ["td_mine"]);
  assert.deepEqual(again.specs.skipped, ["td_mine.diagram.json"]);
  assert.equal(readUserIndex(paths).length, 1);
});

test("files are copied without replacing existing ones; config keeps the new ports", async () => {
  const from = tmp("legacy-data-");
  const paths = labPaths(tmp("new-data-"));
  mkdirSync(path.join(from, "boards"), { recursive: true });
  mkdirSync(path.join(from, "revisions", "td_a"), { recursive: true });
  writeFileSync(path.join(from, "boards", "td_a.tldr"), "old");
  writeFileSync(path.join(from, "revisions", "td_a", "1.tldr"), "rev");
  mkdirSync(paths.boards, { recursive: true });
  writeFileSync(path.join(paths.boards, "td_a.tldr"), "new");
  const report = await importFiles({ fromData: from, paths });
  assert.deepEqual(report.boards, { copied: 0, skipped: 1 });
  assert.deepEqual(report.revisions, { copied: 1, skipped: 0 });
  assert.equal(readFileSync(path.join(paths.boards, "td_a.tldr"), "utf8"), "new");
  assert.deepEqual(readdirSync(path.join(paths.revisions, "td_a")), ["1.tldr"]); // no temp files left behind

  const merged = mergeLegacyConfig(defaultConfig, {
    agent: { chat: { provider: "codex", model: "m" } },
    share: { mode: "cloudflare", port: 4179, bridgePort: 4180, cloudflareTunnelToken: "t", cloudflarePublicUrl: "https://example.test" },
    storage: { maxRevisionsPerBoard: 10 },
  });
  assert.equal(merged.agent.chat.provider, "codex");
  assert.equal(merged.agent.chat.apiKeyEnv, "");
  assert.equal(merged.share.port, defaultConfig.share.port);
  assert.equal(merged.share.bridgePort, defaultConfig.share.bridgePort);
  assert.equal(merged.share.cloudflarePublicUrl, "https://example.test");
  assert.equal(merged.storage.maxRevisionsPerBoard, 10);
  assert.equal(merged.storage.exportDelaySeconds, defaultConfig.storage.exportDelaySeconds);
});

test("chat history that is not a valid list is not imported, so a later run can still pick it up", async () => {
  const from = tmp("legacy-data-");
  const paths = labPaths(tmp("new-data-"));
  mkdirSync(path.join(from, "bridge"), { recursive: true });
  writeFileSync(path.join(from, "bridge", "agent-messages.json"), '[{"id":"m1"'); // caught mid-write
  assert.equal((await importFiles({ fromData: from, paths })).messages, "unreadable");
  assert.equal(existsSync(paths.messages), false);
  writeFileSync(path.join(from, "bridge", "agent-messages.json"), '[{"id":"m1"}]');
  assert.equal((await importFiles({ fromData: from, paths })).messages, true);
  assert.deepEqual(JSON.parse(readFileSync(paths.messages, "utf8")), [{ id: "m1" }]);
});

test("a process holding files open in the target data directory is found, whatever port it uses", { skip: spawnSync("lsof", ["-v"]).error ? "no lsof" : false }, async (t) => {
  const dir = tmp("held-state-");
  const file = path.join(dir, "room.sqlite");
  writeFileSync(file, "");
  assert.deepEqual(processesUsing(dir), []);
  const holder = spawn(process.execPath, ["-e", `require("fs").openSync(${JSON.stringify(file)}, "r"); console.log("open"); setInterval(() => {}, 1000)`], { stdio: ["ignore", "pipe", "ignore"] });
  t.after(() => holder.kill());
  await new Promise((resolve) => holder.stdout.once("data", resolve));
  assert.deepEqual(processesUsing(dir), [holder.pid]);
});

test("lab import keeps an existing config, even the default one, unless --overwrite is given", () => {
  const from = tmp("legacy-data-");
  const data = tmp("new-data-");
  mkdirSync(path.join(from, "state"), { recursive: true });
  writeFileSync(path.join(from, "config.json"), JSON.stringify({ share: { mode: "cloudflare" }, agent: { chat: { provider: "codex" } } }));
  const lab = (...args) => spawnSync(process.execPath, [path.join(projectDir, "scripts/lab.mjs"), ...args], { env: { ...process.env, WHITEBOARD_STUDIO_DATA_DIR: data }, encoding: "utf8" });
  assert.equal(lab("init").status, 0);
  // Ports nobody uses, so a real lab on the default ports does not make the import refuse.
  const config = JSON.parse(readFileSync(path.join(data, "config.json"), "utf8"));
  Object.assign(config.share, { port: 1, bridgePort: 2 });
  writeFileSync(path.join(data, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  const before = readFileSync(path.join(data, "config.json"), "utf8");
  const run = lab("import", "--from", from);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(path.join(data, "config.json"), "utf8"), before);
  assert.equal(lab("import", "--from", from, "--overwrite").status, 0);
  assert.equal(JSON.parse(readFileSync(path.join(data, "config.json"), "utf8")).share.mode, "cloudflare");
});
