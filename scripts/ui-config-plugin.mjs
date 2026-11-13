// Dev-server route GET /api/ui-config: the non-secret UI settings from <data dir>/config.json.
// It answers only `{ locale }`, so it is safe for tunnel and LAN guests (they see the board in the owner's UI language).
import { labPaths, loadConfig } from "./lib/lab-config.mjs";
import { uiLocaleFromConfig } from "../app/domain/locale.mjs";

export const UI_CONFIG_ROUTE = "/api/ui-config";

/** Read on every request, so a config edit applies on the next page load. A broken config falls back to the default. */
export function uiConfigBody(paths = labPaths()) {
  let config = {};
  try {
    config = loadConfig(paths);
  } catch {
    /* invalid JSON: keep the default locale */
  }
  return { locale: uiLocaleFromConfig(config) };
}

export function uiConfigPlugin() {
  return {
    name: "whiteboard-studio-ui-config",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (pathname !== UI_CONFIG_ROUTE || (req.method !== "GET" && req.method !== "HEAD")) return next();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        return res.end(JSON.stringify(uiConfigBody()));
      });
    },
  };
}
