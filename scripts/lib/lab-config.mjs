// Shared configuration for every Whiteboard Studio process (dev server, agent bridge,
// launcher, CLI). All user data lives in one directory outside the checkout so
// that cloning, cleaning `.wrangler`, or reinstalling never loses boards.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const projectDir = path.resolve(import.meta.dirname, "..", "..");

export function dataDir() {
  const configured = process.env.WHITEBOARD_STUDIO_DATA_DIR;
  if (configured) return path.resolve(configured.replace(/^~(?=$|[\\/])/, os.homedir()));
  return path.join(os.homedir(), "WhiteboardStudio-data");
}

export function labPaths(root = dataDir()) {
  const bridge = path.join(root, "bridge");
  return {
    root,
    config: path.join(root, "config.json"),
    // Wrangler/Miniflare persistence root (contains `v3/do/...` SQLite files).
    state: path.join(root, "state"),
    // Human-readable `.tldr` copies of every board, refreshed automatically.
    boards: path.join(root, "boards"),
    // Timestamped `.tldr` snapshots per board: revisions/<boardId>/<iso>.tldr
    revisions: path.join(root, "revisions"),
    // Agent-generated and uploaded files served as /api/agent/assets/<name>.
    assets: path.join(root, "assets"),
    bridge,
    messages: path.join(bridge, "agent-messages.json"),
    jobs: path.join(bridge, "jobs"),
    // Runtime on/off switch for the agent chat (presence = enabled).
    agentEnabled: path.join(bridge, "agent-enabled"),
  };
}

export const defaultConfig = {
  agent: {
    // Chat provider builds editable diagrams from chat messages.
    // "none" | "codex" | "claude" | "pi" | "openai-compatible"
    chat: { provider: "none", model: "", baseUrl: "", apiKey: "", apiKeyEnv: "" },
    // Image provider renders raster pictures. "none" | "codex"
    image: { provider: "none", model: "" },
  },
  share: {
    // "local": only this computer; "lan": other machines in the same network;
    // "cloudflare": public Quick Tunnel (or a named tunnel when a token is set).
    mode: "local",
    port: 4173,
    bridgePort: 4174,
    cloudflareTunnelToken: "",
    cloudflarePublicUrl: "",
  },
  storage: {
    exportDelaySeconds: 10,
    revisionIntervalMinutes: 30,
    maxRevisionsPerBoard: 50,
  },
};

function merge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = base[key] && typeof base[key] === "object" && !Array.isArray(base[key]) ? merge(base[key], value) : value;
  }
  return result;
}

export function loadConfig(paths = labPaths()) {
  let fileConfig = {};
  if (existsSync(paths.config)) {
    try {
      fileConfig = JSON.parse(readFileSync(paths.config, "utf8"));
    } catch (error) {
      throw new Error(`Invalid JSON in ${paths.config}: ${error.message}`);
    }
  }
  return merge(defaultConfig, fileConfig);
}

export function saveConfig(config, paths = labPaths()) {
  mkdirSync(paths.root, { recursive: true });
  writeFileSync(paths.config, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

export function ensureDataDirs(paths = labPaths()) {
  for (const dir of [paths.root, paths.state, paths.boards, paths.revisions, paths.assets, paths.bridge, paths.jobs]) {
    mkdirSync(dir, { recursive: true });
  }
  return paths;
}

/** Resolves the chat API key without ever logging it. */
export function resolveApiKey(chat) {
  if (chat.apiKeyEnv && process.env[chat.apiKeyEnv]) return process.env[chat.apiKeyEnv];
  return chat.apiKey || "";
}
