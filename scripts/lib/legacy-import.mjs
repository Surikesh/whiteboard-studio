// Imports the data of an earlier "Tldraw Lab" install (its data directory and, optionally, its checkout)
// into the Whiteboard Studio data directory. The source is only read: SQLite files are copied with
// `VACUUM INTO` through a read-only connection, so a running old app keeps working and its WAL is
// included. Nothing that already exists in the target is replaced unless `overwrite` is set, so the
// import can be repeated to pick up boards created later.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeSpec } from "../../app/domain/spec/format.mjs";
import { readUserIndex, repoPaths, writeUserIndex } from "./workspace-overlay.mjs";

const DO_CLASS = "TldrawDurableObject";

/**
 * Miniflare's id for `idFromName(name)` in a namespace whose unique key is `<worker name>-<class name>`
 * (miniflare 4, `DurableObjectNamespace.idFromName`). Files live at `v3/do/<unique key>/<id>.sqlite`.
 */
export function durableObjectId(uniqueKey, name) {
  const key = crypto.createHash("sha256").update(uniqueKey).digest();
  const nameHmac = crypto.createHmac("sha256", key).update(name).digest().subarray(0, 16);
  const hmac = crypto.createHmac("sha256", key).update(nameHmac).digest().subarray(0, 16);
  return Buffer.concat([nameHmac, hmac]).toString("hex");
}

export const uniqueKeyFor = (workerName) => `${workerName}-${DO_CLASS}`;

async function openSqlite(file, readOnly) {
  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(file, { readOnly });
}

/** The room name Miniflare stored in the object's own database, or null. */
export async function storedRoomName(file) {
  const db = await openSqlite(file, true);
  try {
    return db.prepare("SELECT name FROM __miniflare_do_name LIMIT 1").get()?.name ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/** A consistent single-file copy of a live SQLite database (WAL included), written atomically. */
export async function copySqlite(source, target) {
  const tmp = `${target}.import-${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  const db = await openSqlite(source, true);
  try {
    db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
  } finally {
    db.close();
  }
  for (const suffix of ["-wal", "-shm"]) rmSync(`${target}${suffix}`, { force: true });
  renameSync(tmp, target);
}

function copyTree(source, target, overwrite, dryRun, counts) {
  if (!existsSync(source)) return;
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to, overwrite, dryRun, counts);
    else if (entry.isFile()) {
      if (existsSync(to) && !overwrite) {
        counts.skipped += 1;
        continue;
      }
      if (!dryRun) {
        mkdirSync(target, { recursive: true });
        copyFileAtomic(from, to);
      }
      counts.copied += 1;
    }
  }
}

/** Copy through a sibling temp file, so an interrupted copy never leaves a partial or half-replaced target. */
function copyFileAtomic(from, to) {
  const tmp = `${to}.import-${process.pid}.tmp`;
  try {
    copyFileSync(from, tmp);
    renameSync(tmp, to);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * Process ids (other than this one) holding files open under `dir`, via `lsof`. Catches a destination lab started
 * any way (lab start, npm start on any port). Returns null when lsof is not installed, so the caller falls back to
 * the port check. Throws when lsof ran but its answer cannot be trusted (error exit, diagnostics, timeout), so the
 * import never writes on an uncertain "nobody".
 */
export function processesUsing(dir, { command = "lsof", timeoutMs = 30_000 } = {}) {
  if (!existsSync(dir)) return [];
  const run = spawnSync(command, ["-t", "+D", dir], { encoding: "utf8", timeout: timeoutMs });
  if (run.error?.code === "ENOENT") return null;
  const pids = [...new Set(String(run.stdout ?? "").split(/\s+/).filter(Boolean).map(Number))];
  // lsof exits 0 or 1 (macOS lsof +D exits 1 even when it lists matches); a failure or partial scan shows up as
  // another status or as diagnostics on stderr.
  const clean = run.status === 0 || run.status === 1;
  if (run.error || !clean || String(run.stderr ?? "").trim() || pids.some((pid) => !Number.isInteger(pid)))
    throw new Error(`Could not tell whether ${dir} is in use (${run.error?.code === "ETIMEDOUT" ? `lsof took longer than ${timeoutMs / 1000} s` : `lsof: ${String(run.stderr || run.error?.message || `exit ${run.status}`).trim().split("\n")[0]}`}); stop every lab using it and try again`);
  return pids.filter((pid) => pid !== process.pid);
}

/** The old bridge rewrites its chat file in place; take it only when two reads agree and it parses as a list. */
async function stableMessages(file) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const first = readFileSync(file);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const second = readFileSync(file);
      if (first.equals(second) && Array.isArray(JSON.parse(second.toString("utf8")))) return second;
    } catch {
      // mid-write, gone or unreadable: try again
    }
  }
  return null;
}

const sameFile = (a, b) => {
  try {
    return existsSync(b) && statSync(a).size === statSync(b).size && readFileSync(a).equals(readFileSync(b));
  } catch {
    return false; // decided by the guarded read in stableMessages
  }
};

/**
 * Durable Object rooms: each `<old id>.sqlite` gets the id its room name has under the new worker name.
 * The room name is read from the database itself; files without one are reported and left alone.
 */
export async function importRooms({ fromState, toState, newUniqueKey, overwrite = false, dryRun = false }) {
  const doRoot = path.join(fromState, "v3", "do");
  const report = { copied: [], skipped: [], unnamed: [], mismatched: [] };
  if (!existsSync(doRoot)) return report;
  const keys = readdirSync(doRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.endsWith(`-${DO_CLASS}`));
  const targetDir = path.join(toState, "v3", "do", newUniqueKey);
  for (const { name: oldKey } of keys) {
    const dir = path.join(doRoot, oldKey);
    for (const file of readdirSync(dir)
      .filter((f) => /^[0-9a-f]{64}\.sqlite$/.test(f))
      .sort()) {
      const oldId = file.slice(0, -".sqlite".length);
      const room = await storedRoomName(path.join(dir, file));
      if (!room) {
        report.unnamed.push(oldId);
        continue;
      }
      if (durableObjectId(oldKey, room) !== oldId) report.mismatched.push({ room, oldId });
      const target = path.join(targetDir, `${durableObjectId(newUniqueKey, room)}.sqlite`);
      if (existsSync(target) && !overwrite) {
        report.skipped.push(room);
        continue;
      }
      if (!dryRun) {
        mkdirSync(targetDir, { recursive: true });
        await copySqlite(path.join(dir, file), target);
      }
      report.copied.push(room);
    }
  }
  return report;
}

/**
 * Board list and specs of the old checkout (`public/workspace/index.json`, `public/diagrams/`) go to the
 * user's index and diagrams folder. Entries and files that this repository ships as demos stay demos.
 */
export function importWorkspace({ fromRepo, projectDir, paths, overwrite = false, dryRun = false }) {
  const report = { boards: { added: [], kept: [], demo: [] }, specs: { copied: [], skipped: [], demo: [] } };
  const from = repoPaths(fromRepo);
  const demo = repoPaths(projectDir);
  const demoIds = new Set(readList(demo.workspaceIndex).map((item) => item?.id));
  const user = readUserIndex(paths);
  const userIds = new Set(user.map((item) => item?.id));
  const next = overwrite ? [] : [...user];
  const incoming = readList(from.workspaceIndex);
  const incomingIds = new Set();
  for (const item of incoming) {
    if (!item || typeof item.id !== "string") continue;
    if (demoIds.has(item.id)) report.boards.demo.push(item.id);
    else if (userIds.has(item.id) && !overwrite) report.boards.kept.push(item.id);
    else {
      next.push(item);
      incomingIds.add(item.id);
      report.boards.added.push(item.id);
    }
  }
  if (overwrite) for (const item of user) if (!incomingIds.has(item?.id)) next.push(item);
  if (!dryRun && report.boards.added.length) writeUserIndex(paths, next);

  if (existsSync(from.diagrams)) {
    for (const name of readdirSync(from.diagrams)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      const source = path.join(from.diagrams, name);
      if (existsSync(path.join(demo.diagrams, name))) {
        report.specs.demo.push(name);
        continue;
      }
      const target = path.join(paths.diagrams, name);
      if (existsSync(target) && !overwrite) {
        report.specs.skipped.push(name);
        continue;
      }
      if (!dryRun) {
        mkdirSync(paths.diagrams, { recursive: true });
        let text = readFileSync(source, "utf8");
        try {
          text = `${JSON.stringify(normalizeSpec(JSON.parse(text)), null, 2)}\n`;
        } catch {
          // not a spec we understand: copy it unchanged
        }
        writeFileAtomic(target, text);
      }
      report.specs.copied.push(name);
    }
  }
  return report;
}

function writeFileAtomic(file, text) {
  const tmp = `${file}.import-${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function readList(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error(`${file}: ${error.message}`);
  }
}

/** Old config values worth keeping. Ports are not taken over: `lab import` warns when they clash with the old install. */
export function mergeLegacyConfig(current, legacy) {
  const next = structuredClone(current);
  if (legacy?.agent && typeof legacy.agent === "object") {
    for (const part of ["chat", "image"]) if (legacy.agent[part]) next.agent[part] = { ...next.agent[part], ...legacy.agent[part] };
  }
  if (legacy?.storage && typeof legacy.storage === "object") next.storage = { ...next.storage, ...legacy.storage };
  const share = legacy?.share ?? {};
  for (const key of ["mode", "cloudflareTunnelToken", "cloudflarePublicUrl"]) if (typeof share[key] === "string" && share[key]) next.share[key] = share[key];
  return next;
}

/** Plain files: board exports, revisions, agent assets and the chat history. */
export async function importFiles({ fromData, paths, overwrite = false, dryRun = false }) {
  const report = {};
  for (const [name, target] of [
    ["boards", paths.boards],
    ["revisions", paths.revisions],
    ["assets", paths.assets],
  ]) {
    const counts = { copied: 0, skipped: 0 };
    copyTree(path.join(fromData, name), target, overwrite, dryRun, counts);
    report[name] = counts;
  }
  const messages = path.join(fromData, "bridge", "agent-messages.json");
  report.messages = existsSync(messages) && (overwrite || !existsSync(paths.messages)) && !(existsSync(paths.messages) && sameFile(messages, paths.messages));
  if (report.messages && !dryRun) {
    const data = await stableMessages(messages);
    if (!data) report.messages = "unreadable";
    else {
      mkdirSync(path.dirname(paths.messages), { recursive: true });
      writeFileAtomic(paths.messages, data);
    }
  }
  return report;
}
