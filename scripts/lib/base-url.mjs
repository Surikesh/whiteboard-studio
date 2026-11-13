// Base URL of the running app for CLI scripts and test:live. WHITEBOARD_STUDIO_URL wins; otherwise the
// lab started by `npm run lab -- start` (its entry point is the bridge port from the local config) when it
// runs, else what `npm start` prints first.
import { labPaths, loadConfig } from "./lab-config.mjs";
import { readShareState, supervisorAlive } from "./share-supervisor.mjs";

export function labBaseUrl(env = process.env, paths = labPaths()) {
  if (env.WHITEBOARD_STUDIO_URL) return env.WHITEBOARD_STUDIO_URL.replace(/\/+$/, "");
  if (supervisorAlive(readShareState(paths))) return `http://127.0.0.1:${loadConfig(paths).share.bridgePort}`;
  return "http://localhost:3000";
}
