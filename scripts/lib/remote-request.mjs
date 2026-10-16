// The local/remote boundary for every server route that touches private data.
// "Remote" means a tunnel guest (Cloudflare adds cf-connecting-ip) or any non-loopback socket (LAN guest).
// Pure helpers only, so the route table is testable without a server or a tunnel.
import path from "node:path";

const LOOPBACK = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1|localhost)$/;

export const isLoopbackAddress = (address) => LOOPBACK.test(String(address ?? "").trim());

/**
 * Remote = a `cf-connecting-ip` header of any value, or a non-loopback socket. Cloudflare's edge sets
 * Cloudflare's `CF-Connecting-IP` to the visitor's address on every tunnelled request
 * (https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip), and cloudflared
 * forwards it to the origin (scripts/share-tunnel.mjs:34 starts `cloudflared tunnel --url`). A local browser
 * talking straight to the Vite dev server or the bridge sends no such header. Miniflare adds a loopback value
 * of its own only inside the worker (node_modules/miniflare/dist/src/workers/core/entry.worker.js:4435,
 * miniflare 4.20260515.0), after the Vite middleware, so node-level code never sees that stamp and must not
 * trust a loopback header value: any header means a guest.
 */
export function isRemoteRequest(req) {
  const header = req.headers["cf-connecting-ip"];
  const value = Array.isArray(header) ? header.join(",") : header;
  if (value !== undefined && value !== "") {
    return true;
  }
  const address = req.socket?.remoteAddress;
  return address !== undefined && !isLoopbackAddress(address);
}

/**
 * Canonical path for authorization decisions: decoded, duplicate slashes and dot segments collapsed, lower-cased.
 * Returns null when the URL cannot be a request path (not origin-form, bad escapes, NUL).
 */
export function canonicalPath(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.startsWith("/")) return null;
  let pathname = rawUrl.split(/[?#]/)[0];
  try {
    // Decode repeatedly so double-encoded separators cannot hide a prefix.
    for (let i = 0; i < 3; i++) pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  return path.posix
    .normalize(pathname.replace(/\\/g, "/"))
    .replace(/\/{2,}/g, "/")
    .toLowerCase();
}

/** True for /api/lab and everything under it (board snapshots and revisions: this computer only). */
export const isLabPath = (canonical) => canonical === "/api/lab" || canonical.startsWith("/api/lab/");

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const REMOTE_ASSET = new RegExp(`^${UUID}(?:-${UUID})?\\.(?:png|jpe?g|webp|gif|svg|mp4|webm)$`, "i");

/**
 * Remote guests may fetch only bridge-generated assets: `<uuid>.<ext>` (uploads) or `<jobId>-<uuid>.png` (generated images).
 * Names are unguessable, flat, and extension-limited; there is no listing route.
 */
export const isRemoteAssetName = (name) => typeof name === "string" && REMOTE_ASSET.test(name);

/**
 * Route table of the agent bridge for a given caller. The bridge applies this before any handler runs.
 * @returns {"allow" | "deny" | "minimal"} minimal: answer without configuration details (status only).
 */
export function agentRouteAccess({ method, pathname, remote, agentEnabled }) {
  const route = `${method} ${pathname}`;
  const guarded = ["POST /api/agent/upload", "GET /api/agent/messages", "DELETE /api/agent/messages", "POST /api/agent/claim", "POST /api/agent/chat"];
  if (guarded.includes(route)) return !remote || agentEnabled ? "allow" : "deny";
  if (route === "GET /api/agent/status") return !remote || agentEnabled ? "allow" : "minimal";
  return "allow"; // assets are validated by name in the handler; anything else is the proxied app
}
