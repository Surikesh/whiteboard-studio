#!/usr/bin/env node
// Whiteboard Studio launcher: init / start / agent / config / doctor.
// Pure Node, works on macOS, Linux and Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, accessSync, constants } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { projectDir, labPaths, loadConfig, saveConfig, defaultConfig, ensureDataDirs } from "./lib/lab-config.mjs";
import { readShareState, startShareSupervisor, supervisorAlive } from "./lib/share-supervisor.mjs";
import { maskConfig, chatModel, imageModel, chatConfigured, imageConfigured } from "./lib/agent-providers.mjs";

const isWin = process.platform === "win32";
const [command, ...rest] = process.argv.slice(2);

function usage() {
  console.log(`Usage: node scripts/lab.mjs <command>

  init                  create the data directory and a default config.json
  start                 start the app, the agent bridge and (optionally) a tunnel
  share on|off|restart|status [--wait SECONDS]
                        switch the Cloudflare link of the running lab; --wait blocks until it works
  agent on|off|status   toggle the agent chat at runtime
  config                show config path and config (secrets masked)
  doctor                check Node and optional tools
  import --from DATA_DIR [--repo CHECKOUT] [--overwrite] [--dry-run]
                        copy boards, revisions, assets, chat history and config of an earlier
                        Tldraw Lab install; --repo also brings its board list and diagram specs.
                        Stop this lab first; the old one may keep running.`);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeShare(state) {
  if (!state) return "status: not running (start the lab with `npm run lab -- start`)";
  const lines = [`status: ${state.status}${state.linkReady ? "" : state.status === "off" ? "" : " (link not ready yet)"}`];
  if (state.linkReady && state.url) lines.push(`url: ${state.url}`);
  if (state.lastError && !state.linkReady && state.status !== "off") lines.push(`last error: ${state.lastError}`);
  if (state.nextRestartAt && state.status === "restarting") lines.push(`next restart: ${new Date(state.nextRestartAt).toLocaleTimeString()}`);
  if (state.status === "gave-up") lines.push("automatic restarts paused; `lab share restart` tries again");
  return lines.join("\n");
}

async function shareCommand(action, args) {
  const paths = ensureDataDirs();
  const waitAt = args.indexOf("--wait");
  const waitSeconds = waitAt >= 0 ? Number(args[waitAt + 1] ?? 120) : 0;
  const asJson = args.includes("--json");
  if (!["on", "off", "restart", "status", undefined].includes(action)) {
    console.error("Usage: lab share on|off|restart|status [--wait SECONDS] [--json]");
    process.exit(2);
  }
  let state = readShareState(paths);
  const alive = supervisorAlive(state);
  // A restart has happened once the supervisor launched cloudflared again.
  const launchesBefore = state?.launches ?? 0;
  if (action && action !== "status") {
    if (!alive) throw new Error("Whiteboard Studio is not running. Start it with `npm run lab -- start` first.");
    if (action === "restart" && state.status === "off") throw new Error("The link is off; `lab share on` turns it on.");
    if (action === "on" && !version("cloudflared"))
      throw new Error("`cloudflared` was not found in PATH. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
    if (action === "on") writeFileSync(paths.shareIntent, "");
    if (action === "off") {
      rmSync(paths.shareIntent, { force: true });
      rmSync(paths.agentEnabled, { force: true }); // the agent is only for shared sessions
    }
    if (action === "restart") writeFileSync(paths.shareRestart, String(Date.now()));
  }
  const want = action === "off" ? (s) => s?.status === "off" : action === "on" ? (s) => s?.linkReady : action === "restart" ? (s) => s?.linkReady && (s.launches ?? 0) > launchesBefore : null;
  const deadline = Date.now() + waitSeconds * 1000;
  // Give the supervisor (2 s tick) a moment to pick up a switch before reporting.
  const settleUntil = Date.now() + (action && action !== "status" ? 3_000 : 0);
  let lost = false;
  for (;;) {
    state = readShareState(paths);
    // Never hand out the link of a supervisor that died while we waited.
    if (alive && !supervisorAlive(state)) {
      lost = true;
      break;
    }
    const t = Date.now();
    if (t >= settleUntil && (!want || !waitSeconds || want(state) || t >= deadline)) break;
    await sleep(500);
  }
  if (!supervisorAlive(state)) state = null;
  if (lost) {
    console.error("Whiteboard Studio stopped while waiting for the link.");
    process.exitCode = 1;
  }
  console.log(asJson ? JSON.stringify(state) : describeShare(state));
  if (want && waitSeconds > 0 && !want(state)) process.exitCode = 1;
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
let supervisor = null;

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
  const supervisorStopped = supervisor?.stop() ?? Promise.resolve();
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
  Promise.all([supervisorStopped, ...children.map((c) => new Promise((r) => (c.exitCode !== null ? r() : c.once("exit", r))))]).then(() => process.exit(code));
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

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
    socket.setTimeout(1500, () => (socket.destroy(), resolve(false)));
  });
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  return path.resolve(value.replace(/^~(?=$|[\\/])/, os.homedir()));
}

async function importCommand(args) {
  const fromData = optionValue(args, "--from");
  const fromRepo = optionValue(args, "--repo");
  const overwrite = args.includes("--overwrite");
  const dryRun = args.includes("--dry-run");
  if (!fromData) throw new Error("Usage: lab import --from DATA_DIR [--repo CHECKOUT] [--overwrite] [--dry-run]");
  if (!existsSync(path.join(fromData, "state"))) throw new Error(`${fromData} has no state/ folder; is it a Tldraw Lab data directory?`);
  const paths = dryRun ? labPaths() : ensureDataDirs();
  if (path.resolve(fromData) === path.resolve(paths.root)) throw new Error("--from is this lab's own data directory");
  const config = loadConfig(paths);
  if (!dryRun && ((await portInUse(config.share.port)) || (await portInUse(config.share.bridgePort))))
    throw new Error(`Something listens on port ${config.share.port} or ${config.share.bridgePort}; stop this lab before importing (its rooms are open)`);
  const { importRooms, importWorkspace, importFiles, mergeLegacyConfig, uniqueKeyFor } = await import("./lib/legacy-import.mjs");
  const workerName = readJson(path.join(projectDir, "package.json")).name;
  const rooms = await importRooms({ fromState: path.join(fromData, "state"), toState: paths.state, newUniqueKey: uniqueKeyFor(workerName), overwrite, dryRun });
  const files = importFiles({ fromData, paths, overwrite, dryRun });
  const workspace = fromRepo ? importWorkspace({ fromRepo, projectDir, paths, overwrite, dryRun }) : null;
  const legacyConfigFile = path.join(fromData, "config.json");
  let configImported = false;
  if (existsSync(legacyConfigFile) && (overwrite || !existsSync(paths.config) || readFileSync(paths.config, "utf8") === `${JSON.stringify(defaultConfig, null, 2)}\n`)) {
    if (!dryRun) saveConfig(mergeLegacyConfig(config, readJson(legacyConfigFile)), paths);
    configImported = true;
  }
  const prefix = dryRun ? "would copy" : "copied";
  console.log(`${dryRun ? "Dry run, nothing written. " : ""}Target: ${paths.root}`);
  console.log(`rooms: ${prefix} ${rooms.copied.length}, already there ${rooms.skipped.length}${rooms.unnamed.length ? `, without a stored name (left alone) ${rooms.unnamed.length}` : ""}`);
  if (rooms.mismatched.length) console.log(`  note: ${rooms.mismatched.length} room file(s) had an id that does not match their stored name; imported by name`);
  for (const [name, counts] of Object.entries(files)) if (typeof counts === "object") console.log(`${name}: ${prefix} ${counts.copied} file(s), already there ${counts.skipped}`);
  console.log(`chat history: ${files.messages ? prefix : "kept"}`);
  console.log(
    `config: ${configImported ? `${prefix} (agent, storage and Cloudflare settings; ports stay ${config.share.port}/${config.share.bridgePort})` : "kept (pass --overwrite to merge the old one in)"}`,
  );
  if (workspace) {
    console.log(`board list: ${prefix} ${workspace.boards.added.length}, already there ${workspace.boards.kept.length}, demo ids left as demos ${workspace.boards.demo.length}`);
    console.log(`diagram specs: ${prefix} ${workspace.specs.copied.length}, already there ${workspace.specs.skipped.length}, demo names left as demos ${workspace.specs.demo.length}`);
  }
  const legacyShare = existsSync(legacyConfigFile) ? (readJson(legacyConfigFile).share ?? {}) : {};
  const clash = [legacyShare.port, legacyShare.bridgePort].filter((port) => port && [config.share.port, config.share.bridgePort].includes(port));
  if (clash.length)
    console.log(`warning: the old install also uses port ${clash.join(" and ")}; while it runs, set other share.port / share.bridgePort in ${paths.config}, or the two apps will fight over the ports`);
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
  const { mode, port, bridgePort } = config.share;
  if (!["local", "lan", "cloudflare"].includes(mode)) throw new Error(`Unknown share.mode "${mode}" (local | lan | cloudflare)`);
  if (mode === "cloudflare" && !version("cloudflared")) {
    throw new Error("share.mode is cloudflare but `cloudflared` was not found in PATH. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
  }
  const vinext = process.env.WHITEBOARD_STUDIO_VINEXT_BIN || localBin("vinext");
  if (!vinext) throw new Error("vinext not found in node_modules/.bin. Run `npm install` first.");

  if (supervisorAlive(readShareState(paths))) throw new Error("Whiteboard Studio is already running (see `npm run lab -- share status`).");
  for (const p of [port, bridgePort]) if (await portInUse(p)) throw new Error(`Port ${p} is already in use (another Whiteboard Studio, or change share.port / share.bridgePort in ${paths.config}).`);
  rmSync(paths.agentEnabled, { force: true }); // agent access is OFF on every launch
  rmSync(paths.shareRestart, { force: true });
  // The link is on at launch only when the config asks for it; otherwise `lab share on` (or the app) turns it on.
  if (mode === "cloudflare") writeFileSync(paths.shareIntent, "");
  else rmSync(paths.shareIntent, { force: true });
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

  // cloudflared is owned by the supervisor: when it dies the link is restarted, the lab keeps running.
  supervisor = startShareSupervisor({ paths, config, origin: `http://127.0.0.1:${bridgePort}`, log: (line) => console.log(line) });

  console.log("\nWhiteboard Studio is running. Open:");
  console.log(`  Local:  http://127.0.0.1:${bridgePort}/`);
  if (mode === "lan") for (const ip of lanAddresses()) console.log(`  LAN:    http://${ip}:${bridgePort}/`);
  console.log(`  Public: ${mode === "cloudflare" ? "starting, see the `share: ... -> ready` line" : "off; `npm run lab -- share on` turns it on"}`);
  console.log(`\nAgent chat is OFF. Enable it with: node scripts/lab.mjs agent on   (data: ${paths.root})`);
  console.log("Press Ctrl+C to stop.");
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", () => {
  supervisor?.killNow();
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
    case "share":
      await shareCommand(rest[0], rest.slice(1));
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
    case "import":
      await importCommand(rest);
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
