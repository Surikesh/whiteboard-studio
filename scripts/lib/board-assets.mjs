// Which uploaded/generated files does a stored board reference? A tunnel guest may read an asset only if
// the answer is yes; the file name's shape is never an access criterion.
//
// Boards are persisted by Miniflare as one SQLite file per Durable Object room:
//   <dataDir>/state/v3/do/<namespace>/<hash>.sqlite  (+ -wal), table `documents(id, state, lastChangedClock)`
// (table layout: node_modules/@tldraw/sync-core/src/lib/SQLiteSyncStorage.ts:108, tldraw 5.2.5; location:
// scripts/lib/lab-config.mjs `state`). An asset is referenced when an `asset:*` record has
// props.src ending in `/api/agent/assets/<name>` (relative or absolute URL) AND a `shape:*` record points
// at it with props.assetId, so an image deleted from every board stops being readable.
//
// Freshness rule: the answer is derived from the files on every call. Per room file the derived set is
// cached by (mtime, size) of the .sqlite and its -wal; any change re-reads that file. A file modified in the
// last 2 seconds is never served from cache, so two commits inside one filesystem timestamp tick cannot
// leave a stale "allowed". Vanished files drop out. Any read error means "not referenced" (fail closed).
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ASSET_PREFIX } from "./lab-storage.mjs";
import { labPaths } from "./lab-config.mjs";
import { isRemoteAssetName } from "./remote-request.mjs";

const RECENT_MS = 2000;
/** file -> { sig, names:Set<string> } */
const cache = new Map();
let sqlite;

async function loadSqlite() {
  if (sqlite === undefined) sqlite = await import("node:sqlite").catch(() => null); // Node >= 22.13 (package.json engines)
  return sqlite;
}

function signature(file) {
  const parts = [];
  for (const f of [file, `${file}-wal`]) {
    try {
      const s = statSync(f);
      parts.push(`${s.mtimeMs}:${s.size}`);
    } catch {
      parts.push("-");
    }
  }
  return parts.join("|");
}

function assetNameOf(src) {
  if (typeof src !== "string") return null;
  const at = src.indexOf(ASSET_PREFIX);
  if (at < 0) return null;
  try {
    return decodeURIComponent(src.slice(at + ASSET_PREFIX.length).split(/[?#]/)[0]);
  } catch {
    return null;
  }
}

function referencedNames(DatabaseSync, file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'").all();
    if (tables.length === 0) return new Set();
    const byAssetId = new Map();
    const assetRows = db.prepare("SELECT id, CAST(state AS TEXT) AS state FROM documents WHERE id LIKE 'asset:%' AND instr(state, CAST(? AS BLOB)) > 0").all(ASSET_PREFIX);
    for (const row of assetRows) {
      try {
        const record = JSON.parse(row.state);
        const name = assetNameOf(record?.props?.src);
        if (name) byAssetId.set(record.id ?? row.id, name);
      } catch {
        /* unreadable record: not referenced */
      }
    }
    const names = new Set();
    if (byAssetId.size === 0) return names;
    const shapeRows = db.prepare("SELECT CAST(state AS TEXT) AS state FROM documents WHERE id LIKE 'shape:%' AND instr(state, CAST('assetId' AS BLOB)) > 0").all();
    for (const row of shapeRows) {
      try {
        const assetId = JSON.parse(row.state)?.props?.assetId;
        if (typeof assetId === "string" && byAssetId.has(assetId)) names.add(byAssetId.get(assetId));
      } catch {
        /* skip */
      }
    }
    return names;
  } finally {
    db.close();
  }
}

/** True when a board stored in `dataDir` references the asset file `name`. Never throws. */
export async function isSharedBoardAsset(dataDir, name) {
  try {
    if (typeof name !== "string" || name === "") return false;
    const mod = await loadSqlite();
    if (!mod) return false;
    const root = path.join(labPaths(dataDir).state, "v3", "do");
    let files = [];
    for (const dir of readdirSync(root)) {
      for (const f of readdirSync(path.join(root, dir))) if (f.endsWith(".sqlite")) files.push(path.join(root, dir, f));
    }
    const live = new Set(files);
    for (const known of cache.keys()) if (!live.has(known)) cache.delete(known);
    for (const file of files) {
      const sig = signature(file);
      let entry = cache.get(file);
      const recent = Date.now() - Math.max(statSync(file).mtimeMs, statMtime(`${file}-wal`)) < RECENT_MS;
      if (!entry || entry.sig !== sig || recent) {
        try {
          entry = { sig, names: referencedNames(mod.DatabaseSync, file) };
        } catch {
          cache.delete(file);
          continue;
        }
        cache.set(file, entry);
      }
      if (entry.names.has(name)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function statMtime(file) {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Guest (tunnel or LAN) read of /api/agent/assets/<name>; the caller has already required a flat safe name.
 * Allowed when a stored board references the file. Approved deviation: with agent access enabled by the owner
 * a guest also reads unreferenced bridge-generated names (`<uuid>.<ext>`), because guests then see agent chat
 * results before they are placed on a board.
 */
export async function guestMayReadAsset(dataDir, name, agentEnabled) {
  if (await isSharedBoardAsset(dataDir, name)) return true;
  return Boolean(agentEnabled) && isRemoteAssetName(name);
}
