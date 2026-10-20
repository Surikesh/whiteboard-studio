#!/usr/bin/env node
// Whiteboard Studio launcher: init / start / agent / config / doctor.
// Pure Node, works on macOS, Linux and Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, accessSync, constants } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { projectDir, labPaths, loadConfig, saveConfig, defaultConfig, ensureDataDirs } from "./lib/lab-config.mjs";
import { maskConfig, chatModel, imageModel, chatConfigured, imageConfigured } from "./lib/agent-providers.mjs";

const isWin = process.platform === "win32";
const [command, ...rest] = process.argv.slice(2);

function usage() {
  console.log(`Usage: node scripts/lab.mjs <command>

  init                  create the data directory and a default config.json
  start                 start the app, the agent bridge and (optionally) a tunnel
  agent on|off|status   toggle the agent chat at runtime
  config                show config path and config (secrets masked)
  doctor                check Node and optional tools`);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function init() {
  const paths = ensureDataDirs();
  if (!existsSync(paths.config)) {
    saveConfig(structuredClone(defaultConfig), paths);
    console.log(`Created ${paths.config}`);
  } else {
    console.log(`Config already exists: ${paths.config}`);
  }
  console.log(`Data directory: ${paths.root}`);
}

function agentCommand(action) {
  const paths = ensureDataDirs();
  if (action === "on") writeFileSync(paths.agentEnabled, "");
  else if (action === "off") rmSync(paths.agentEnabled, { force: true });
  else if (action && action !== "status") {
    console.error("Usage: lab agent on|off|status");
    process.exit(2);
  }
  const config = loadConfig(paths);
  const { chat, image } = config.agent;
  console.log(`enabled: ${existsSync(paths.agentEnabled) ? "yes" : "no"}`);
  console.log(
    `chat: ${chat.provider}${chat.provider !== "none" ? ` (${chatModel(chat) || "default model"}, ${chatConfigured(chat) ? "configured" : "NOT configured: set baseUrl and model"})` : " (agent chat unavailable)"}`,
  );
  console.log(`image: ${image.provider}${imageConfigured(image) ? ` (${imageModel(image)})` : " (image generation unavailable)"}`);
}

function configCommand() {
  const paths = labPaths();
  console.log(`# ${paths.config}${existsSync(paths.config) ? "" : " (does not exist yet, showing defaults; run `lab init`)"}`);
  console.log(JSON.stringify(maskConfig(loadConfig(paths)), null, 2));
}

function version(cmd, args = ["--version"]) {
  const result = spawnSync(cmd, args, { encoding: "utf8", shell: isWin, timeout: 15_000 });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr).trim().split(/\r?\n/)[0];
}

function doctor() {
  const engine = readJson(path.join(projectDir, "package.json")).engines?.node || "";
  const min = engine
    .replace(/^[^\d]*/, "")
    .split(".")
    .map(Number);
  const cur = process.versions.node.split(".").map(Number);
  const ok = !min.length || cur[0] > min[0] || (cur[0] === min[0] && (cur[1] > (min[1] || 0) || (cur[1] === (min[1] || 0) && cur[2] >= (min[2] || 0))));
  console.log(`${ok ? "ok  " : "FAIL"} node ${process.versions.node} (required ${engine || "any"})`);
  for (const [name, args] of [["codex"], ["claude"], ["pi"], ["cloudflared"]]) {
    const v = version(name, args);
    console.log(`${v ? "ok  " : "--  "} ${name}: ${v ?? "not found (optional)"}`);
  }
  const py = version("python3") ? ["python3", version("python3")] : version("python") ? ["python", version("python")] : null;
  console.log(`${py ? "ok  " : "--  "} python: ${py ? `${py[0]} ${py[1]}` : "not found (optional, used for background removal)"}`);
  const paths = labPaths();
  try {
    mkdirSync(paths.root, { recursive: true });
    accessSync(paths.root, constants.W_OK);
    console.log(`ok   data dir writable: ${paths.root}`);
  } catch (error) {
    console.log(`FAIL data dir not writable: ${paths.root} (${error.message})`);
  }
  console.log(`${existsSync(paths.config) ? "ok  " : "--  "} config: ${paths.config}${existsSync(paths.config) ? "" : " (missing; run `lab init`)"}`);
  const { chat, image } = loadConfig(paths).agent;
  console.log(`chat provider: ${chat.provider}; image provider: ${image.provider}`);
  const needs = { codex: "codex", claude: "claude", pi: "pi" };
  if (needs[chat.provider] && !version(needs[chat.provider])) console.log(`WARN chat provider ${chat.provider} needs the ${needs[chat.provider]} CLI in PATH`);
  if (image.provider === "codex" && !version("codex")) console.log("WARN image provider codex needs the codex CLI in PATH");
}

// ---------- start ----------

const children = [];
let shuttingDown = false;

function killTree(child) {
  if (child.exitCode !== null || child.signalCode) return;
  try {
    if (isWin) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nStopping Whiteboard Studio...");
  for (const child of children) killTree(child);
  setTimeout(() => {
    for (const child of children)
      if (child.exitCode === null) {
        try {
          if (isWin) child.kill("SIGKILL");
          else process.kill(-child.pid, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    process.exit(code);
  }, 2500).unref();
  Promise.all(children.map((c) => new Promise((r) => (c.exitCode !== null ? r() : c.once("exit", r))))).then(() => process.exit(code));
}

function launch(name, cmd, args, options = {}) {
  const child = spawn(cmd, args, { cwd: projectDir, detached: !isWin, shell: false, stdio: ["ignore", "pipe", "pipe"], ...options });
  children.push(child);
  child.on("error", (error) => {
    console.error(`${name}: ${error.code === "ENOENT" ? `command not found (${cmd})` : error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`${name} exited (${signal || code}); stopping.`);
      shutdown(code || 1);
    }
  });
  return child;
}

function pipeLogs(child, name, onLine) {
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        onLine?.(line);
        if (process.env.WHITEBOARD_STUDIO_VERBOSE) console.log(`[${name}] ${line}`);
      }
    });
  }
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (shuttingDown) return reject(new Error("aborted"));
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => (Date.now() > deadline ? reject(new Error(`Timed out waiting for ${url}`)) : setTimeout(attempt, 400)));
      req.setTimeout(3000, () => req.destroy());
    };
    attempt();
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

function localBin(name) {
  const bin = path.join(projectDir, "node_modules", ".bin", isWin ? `${name}.cmd` : name);
  return existsSync(bin) ? bin : null;
}

async function start() {
  const paths = ensureDataDirs();
  const config = loadConfig(paths);
  const { mode, port, bridgePort, cloudflareTunnelToken, cloudflarePublicUrl } = config.share;
  if (!["local", "lan", "cloudflare"].includes(mode)) throw new Error(`Unknown share.mode "${mode}" (local | lan | cloudflare)`);
  if (mode === "cloudflare" && !version("cloudflared")) {
    throw new Error("share.mode is cloudflare but `cloudflared` was not found in PATH. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
  }
  const vinext = process.env.WHITEBOARD_STUDIO_VINEXT_BIN || localBin("vinext");
  if (!vinext) throw new Error("vinext not found in node_modules/.bin. Run `npm install` first.");

  rmSync(paths.agentEnabled, { force: true }); // agent access is OFF on every launch
  mkdirSync(path.join(projectDir, ".wrangler"), { recursive: true });
  // The app always stays on loopback; in LAN mode only the bridge (the single entry point) is exposed.
  const bind = mode === "lan" ? "0.0.0.0" : "127.0.0.1";
  const env = { ...process.env, WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || path.join(".wrangler", "wrangler.log") };

  console.log(`Starting app on port ${port}...`);
  const appArgs = ["dev", "--hostname", "127.0.0.1", "--port", String(port)];
  const useShell = isWin && /\.(cmd|bat)$/i.test(vinext);
  const app = launch("app", vinext, appArgs, { env, shell: useShell });
  pipeLogs(app, "app");
  await waitForHttp(`http://127.0.0.1:${port}/`, 180_000);

  const bridge = launch("bridge", process.execPath, [path.join(projectDir, "scripts", "agent-bridge.mjs")], {
    env: { ...process.env, AGENT_BRIDGE_PORT: String(bridgePort), AGENT_BRIDGE_HOST: bind, WHITEBOARD_STUDIO_APP_ORIGIN: `http://127.0.0.1:${port}` },
  });
  pipeLogs(bridge, "bridge");
  await waitForHttp(`http://127.0.0.1:${bridgePort}/api/agent/status`, 30_000);

  let publicUrl = null;
  if (mode === "cloudflare") {
    const origin = `http://127.0.0.1:${bridgePort}`;
    const args = cloudflareTunnelToken ? ["tunnel", "--no-autoupdate", "run", "--token", cloudflareTunnelToken] : ["tunnel", "--url", origin, "--no-autoupdate"];
    const tunnel = launch("cloudflared", "cloudflared", args, { shell: isWin });
    const found = new Promise((resolve) => {
      pipeLogs(tunnel, "cloudflared", (line) => {
        const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match) resolve(match[0]);
        if (cloudflareTunnelToken && /Registered tunnel connection/i.test(line)) resolve(cloudflarePublicUrl || null);
      });
    });
    publicUrl = await Promise.race([found, new Promise((r) => setTimeout(() => r(undefined), 60_000))]);
    if (publicUrl === undefined) console.warn("cloudflared did not report a URL within 60 s; check WHITEBOARD_STUDIO_VERBOSE=1 output.");
    if (cloudflareTunnelToken && cloudflarePublicUrl) publicUrl = cloudflarePublicUrl;
  }

  console.log("\nWhiteboard Studio is running. Open:");
  console.log(`  Local:  http://127.0.0.1:${bridgePort}/`);
  if (mode === "lan") for (const ip of lanAddresses()) console.log(`  LAN:    http://${ip}:${bridgePort}/`);
  if (publicUrl) console.log(`  Public: ${publicUrl}`);
  console.log(`\nAgent chat is OFF. Enable it with: node scripts/lab.mjs agent on   (data: ${paths.root})`);
  console.log("Press Ctrl+C to stop.");
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", () => {
  for (const child of children) killTree(child);
});

try {
  switch (command) {
    case "init":
      init();
      break;
    case "start":
      await start();
      break;
    case "agent":
      agentCommand(rest[0]);
      break;
    case "config":
      configCommand();
      break;
    case "doctor":
      doctor();
      break;
    default:
      usage();
      process.exit(command ? 2 : 0);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  shutdown(1);
  if (!children.length) process.exit(1);
}
