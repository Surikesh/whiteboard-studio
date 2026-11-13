// Opens a board URL in the Whiteboard Studio macOS app through its `whiteboardstudio://` scheme
// (the app maps it back to the same local http URL), so boards do not land in a browser tab.
// Without the app (or off macOS) the URL goes to the default browser.
import { spawnSync } from "node:child_process";

/** `http://127.0.0.1:4174/d/x?q` -> `whiteboardstudio://127.0.0.1:4174/d/x?q`; null for non-local URLs. */
export function appUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return null;
  return `whiteboardstudio://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function openBoard(url, { platform = process.platform, run = spawnSync, browser = process.env.WHITEBOARD_STUDIO_OPEN === "browser" } = {}) {
  if (platform !== "darwin") {
    const command = platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
    run(command[0], command[1], { stdio: "ignore" });
    return "browser";
  }
  const app = !browser && appUrl(url);
  if (app && run("open", [app], { stdio: "ignore" }).status === 0) return "app";
  run("open", [url], { stdio: "ignore" });
  return "browser";
}
