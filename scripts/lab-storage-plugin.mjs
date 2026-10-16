// Dev-server plugin: exports every board to a readable .tldr file, keeps
// timestamped revisions, and serves revisions/assets from the data directory.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureDataDirs, labPaths, loadConfig } from "./lib/lab-config.mjs";
import { guestMayReadAsset } from "./lib/board-assets.mjs";
import { canonicalPath, isLabPath, isRemoteRequest } from "./lib/remote-request.mjs";
import { ASSET_PREFIX, assetContentType, boardFileId, boardFileName, isBoardId, isSafeBasename, revisionFileName, revisionsToPrune, shouldWriteRevision, snapshotToTldr } from "./lib/lab-storage.mjs";

const POLL_MS = 3000;

function atomicWrite(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

export function labStoragePlugin({ projectDir = process.cwd() } = {}) {
  const paths = labPaths();
  return {
    name: "tldraw-lab-storage",
    apply: "serve",
    configureServer(server) {
      ensureDataDirs(paths);
      const config = loadConfig(paths);
      const { exportDelaySeconds, revisionIntervalMinutes, maxRevisionsPerBoard } = config.storage;
      const warned = new Set();
      const warn = (key, error) => {
        if (warned.has(key)) return;
        warned.add(key);
        console.warn(`[lab-storage] ${key}: ${error?.message ?? error}`);
      };

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const canonical = canonicalPath(req.url ?? "") ?? "";
        const isLab = isLabPath(canonical);
        const isAsset = url.pathname.startsWith(ASSET_PREFIX);
        if (!isLab && !isAsset) return next();
        const remote = isRemoteRequest(req); // any cf-connecting-ip header marks a guest (see remote-request.mjs)
        if (isLab && remote) {
          res.statusCode = 403;
          return res.end("Forbidden");
        }
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        try {
          if (isAsset) {
            const raw = url.pathname.slice(ASSET_PREFIX.length);
            const name = decodeURIComponent(raw);
            const file = path.join(paths.assets, name);
            if (!isSafeBasename(name)) {
              res.statusCode = 400;
              return res.end("Invalid asset");
            }
            // Guests get only files a stored board references (same rule as the bridge).
            if (remote && !(await guestMayReadAsset(paths.root, name, existsSync(paths.agentEnabled)))) {
              res.statusCode = 404;
              return res.end("Not found");
            }
            if (!existsSync(file)) return next(); // let the agent bridge / app handle it
            res.writeHead(200, {
              "content-type": assetContentType(name),
              "cache-control": "public, max-age=31536000, immutable",
              "x-content-type-options": "nosniff",
              "content-security-policy": "sandbox",
            });
            return res.end(readFileSync(file));
          }
          if (url.pathname === "/api/lab/revisions") {
            const id = url.searchParams.get("id") ?? "";
            if (!isBoardId(id)) {
              res.statusCode = 400;
              return res.end("Invalid id");
            }
            const dir = path.join(paths.revisions, id);
            const files = existsSync(dir)
              ? readdirSync(dir)
                  .filter((f) => f.endsWith(".tldr"))
                  .sort()
                  .reverse()
              : [];
            const list = files.flatMap((file) => {
              const m = /^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d(?:\.\d+)?Z)\.tldr$/.exec(file);
              return m ? [{ at: `${m[1]}:${m[2]}:${m[3]}`, file }] : [];
            });
            res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
            return res.end(JSON.stringify(list));
          }
          const m = /^\/api\/lab\/revisions\/([^/]+)\/([^/]+)$/.exec(url.pathname);
          if (m) {
            const id = decodeURIComponent(m[1]);
            const file = decodeURIComponent(m[2]);
            if (!isBoardId(id) || !isSafeBasename(file) || !file.endsWith(".tldr")) {
              res.statusCode = 400;
              return res.end("Invalid revision");
            }
            const target = path.join(paths.revisions, id, file);
            if (!existsSync(target)) {
              res.statusCode = 404;
              return res.end("Not found");
            }
            res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
            return res.end(readFileSync(target));
          }
          return next(); // e.g. /api/lab/snapshot/:id is served by the Worker
        } catch (error) {
          warn("middleware", error);
          res.statusCode = 500;
          return res.end("Error");
        }
      });

      // boardId -> { clock, changedAt, exported }
      const state = new Map();
      let busy = false;
      let cachedIds = null;
      let cachedIdsAt = 0;

      const readAsset = (name) => {
        try {
          return readFileSync(path.join(paths.assets, name));
        } catch {
          return null;
        }
      };

      async function boardIds(base) {
        const ids = new Map();
        try {
          const index = JSON.parse(readFileSync(path.join(projectDir, "public/workspace/index.json"), "utf8"));
          for (const d of index) if (isBoardId(d?.id)) ids.set(d.id, d.title);
        } catch {
          /* optional */
        }
        const response = await fetch(`${base}/api/workspace`);
        if (response.ok) for (const d of await response.json()) if (isBoardId(d?.id)) ids.set(d.id, d.title ?? ids.get(d.id));
        return ids;
      }

      function exportBoard(id, title, snapshot, entry) {
        const text = JSON.stringify(snapshotToTldr(snapshot, readAsset));
        const name = boardFileName(title, id);
        atomicWrite(path.join(paths.boards, name), text);
        for (const old of readdirSync(paths.boards)) {
          if (old !== name && boardFileId(old) === id) {
            try {
              unlinkSync(path.join(paths.boards, old));
            } catch {
              /* ignore */
            }
          }
        }
        const dir = path.join(paths.revisions, id);
        const files = existsSync(dir) ? readdirSync(dir) : [];
        if (shouldWriteRevision(files, new Date(), revisionIntervalMinutes)) {
          atomicWrite(path.join(dir, revisionFileName()), text);
          for (const old of revisionsToPrune(readdirSync(dir), maxRevisionsPerBoard)) {
            try {
              unlinkSync(path.join(dir, old));
            } catch {
              /* ignore */
            }
          }
        }
        entry.exported = entry.clock;
        entry.title = title;
      }

      async function tick(base) {
        if (busy) return;
        busy = true;
        try {
          let ids;
          // The board list changes rarely; refresh it every 30 s (each fetch is a logged request).
          if (!cachedIds || Date.now() - cachedIdsAt > 30_000) {
            try {
              cachedIds = await boardIds(base);
              cachedIdsAt = Date.now();
            } catch {
              return;
            } // server warming up
          }
          ids = cachedIds;
          for (const [id, title] of ids) {
            try {
              const response = await fetch(`${base}/api/lab/snapshot/${id}.json?clock=1`);
              if (!response.ok) continue;
              const { clock } = await response.json();
              const now = Date.now();
              let entry = state.get(id);
              if (!entry) {
                // First sight: boards that already have a file are only re-exported after a real change.
                entry = { clock, changedAt: now, exported: undefined, title };
                const hasFile = existsSync(paths.boards) && readdirSync(paths.boards).some((f) => boardFileId(f) === id);
                if (hasFile) entry.exported = clock;
                state.set(id, entry);
              } else if (entry.clock !== clock) {
                entry.clock = clock;
                entry.changedAt = now;
              }
              const titleChanged = entry.exported === entry.clock && entry.title !== title;
              const dirty = entry.exported !== entry.clock || titleChanged;
              if (dirty && now - entry.changedAt >= exportDelaySeconds * 1000) {
                const full = await fetch(`${base}/api/lab/snapshot/${id}.json`);
                if (!full.ok) continue;
                const { clock: fullClock, snapshot } = await full.json();
                if (fullClock !== entry.clock) {
                  entry.clock = fullClock;
                  entry.changedAt = Date.now();
                  continue;
                }
                // Empty rooms without any shapes are not worth a file.
                if (snapshot.documents.some((d) => d.state?.typeName === "shape")) exportBoard(id, title, snapshot, entry);
                else entry.exported = entry.clock;
                warned.delete(id);
              }
            } catch (error) {
              warn(id, error);
            }
          }
        } finally {
          busy = false;
        }
      }

      server.httpServer?.once("listening", () => {
        const address = server.httpServer.address();
        if (!address || typeof address === "string") return;
        const host = address.address === "::" || address.address === "0.0.0.0" ? "127.0.0.1" : address.address;
        const base = `http://${host.includes(":") ? `[${host}]` : host}:${address.port}`;
        const timer = setInterval(() => {
          void tick(base).catch((error) => warn("tick", error));
        }, POLL_MS);
        timer.unref();
        server.httpServer.once("close", () => clearInterval(timer));
      });
    },
  };
}
