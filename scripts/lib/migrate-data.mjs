// One-time, non-destructive migration of legacy project-local data
// (.wrangler/state/v3, .share-tunnel/agent-assets, agent-messages.json) into
// the Tldraw Lab data directory. Old copies are never modified or deleted.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { labPaths, projectDir as defaultProjectDir } from "./lab-config.mjs";

function hasContent(dir) {
  try {
    return statSync(dir).isDirectory() && readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

export function migrateData({ projectDir = defaultProjectDir, paths = labPaths(), log = console.log } = {}) {
  const actions = [];
  const note = (message) => {
    actions.push(message);
    log(`[lab-migrate] ${message}`);
  };
  if (process.env.TLDRAW_LAB_SKIP_MIGRATION === "1") return actions;

  const oldState = path.join(projectDir, ".wrangler", "state", "v3");
  const newState = path.join(paths.state, "v3");
  if (!hasContent(newState) && hasContent(oldState)) {
    mkdirSync(paths.state, { recursive: true });
    cpSync(oldState, newState, { recursive: true, errorOnExist: false, force: false });
    note(`copied ${oldState} -> ${newState}`);
  }

  const oldAssets = path.join(projectDir, ".share-tunnel", "agent-assets");
  if (hasContent(oldAssets)) {
    mkdirSync(paths.assets, { recursive: true });
    for (const name of readdirSync(oldAssets)) {
      const from = path.join(oldAssets, name);
      const to = path.join(paths.assets, name);
      if (!statSync(from).isFile() || existsSync(to)) continue;
      cpSync(from, to);
      note(`copied asset ${name}`);
    }
  }

  const oldMessages = path.join(projectDir, ".share-tunnel", "agent-messages.json");
  if (existsSync(oldMessages) && !existsSync(paths.messages)) {
    mkdirSync(path.dirname(paths.messages), { recursive: true });
    cpSync(oldMessages, paths.messages);
    note(`copied ${oldMessages} -> ${paths.messages}`);
  }
  return actions;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const actions = migrateData();
  if (!actions.length) console.log("[lab-migrate] nothing to migrate");
}
