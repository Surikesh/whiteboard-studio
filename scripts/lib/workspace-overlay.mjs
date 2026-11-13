// The board list and diagram specs come from two places:
// - public/workspace/index.json and public/diagrams/: the demo boards shipped with the repository;
// - <data dir>/workspace/index.json and <data dir>/diagrams/: the user's own boards, outside git.
// Readers see one list (a user entry replaces a demo entry with the same id) and one /diagrams/ folder
// (a user file wins). Writers (the workspace and diagram CLIs) only ever write to the data directory.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIAGRAM_URL = /^\/diagrams\/([A-Za-z0-9._-]+\.json)$/;

export function repoPaths(projectDir) {
  return { workspaceIndex: path.join(projectDir, "public", "workspace", "index.json"), diagrams: path.join(projectDir, "public", "diagrams") };
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

/** The user's own index (data directory only). */
export const readUserIndex = (paths) => readList(paths.workspaceIndex);

/** Demo entries first, each replaced by a user entry with the same id; user-only entries follow in their order. */
export function mergedIndex(projectDir, paths) {
  const user = readUserIndex(paths);
  const byId = new Map(user.map((item) => [item?.id, item]));
  const demo = readList(repoPaths(projectDir).workspaceIndex).map((item) => byId.get(item?.id) ?? item);
  const demoIds = new Set(demo.map((item) => item?.id));
  return [...demo, ...user.filter((item) => !demoIds.has(item?.id))];
}

export function writeUserIndex(paths, items) {
  mkdirSync(path.dirname(paths.workspaceIndex), { recursive: true });
  const tmp = `${paths.workspaceIndex}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(items, null, 2)}\n`);
  renameSync(tmp, paths.workspaceIndex);
}

/** Basename of a `/diagrams/<name>.json` URL, or null for anything else (no folders, no dot segments). */
export function diagramName(sourceUrl) {
  const match = DIAGRAM_URL.exec(String(sourceUrl ?? "").split(/[?#]/)[0]);
  return match && !match[1].startsWith(".") ? match[1] : null;
}

/** The file behind a `/diagrams/...` URL: the user's copy if there is one, else the demo file, else null. */
export function resolveDiagramFile(projectDir, paths, sourceUrl) {
  const name = diagramName(sourceUrl);
  if (!name) return null;
  for (const dir of [paths.diagrams, repoPaths(projectDir).diagrams]) {
    const file = path.join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

/** Where a CLI writes the spec behind `/diagrams/<name>`: always the data directory. */
export function userDiagramFile(paths, name) {
  if (!diagramName(`/diagrams/${name}`)) throw new Error(`Invalid diagram file name: ${name}`);
  mkdirSync(paths.diagrams, { recursive: true });
  return path.join(paths.diagrams, name);
}
