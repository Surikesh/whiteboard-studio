// Share-link supervisor: the one owner of the cloudflared process while `lab start` runs.
// The decisions live in share-policy.mjs; this file does the I/O: it spawns cloudflared, probes the
// tunnel, watches the intent switch written by `lab share on|off|restart`, notices a wake from sleep,
// and publishes the state to <data>/share/state.json for the macOS app and the CLI.
import { spawn } from "node:child_process";
import dns from "node:dns";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { initialState, publicView, step } from "./share-policy.mjs";

const TICK_MS = 2_000;
// The timer runs every TICK_MS; a much longer gap means the machine slept.
const WAKE_GAP_MS = 20_000;
const PROBE_READY_MS = 30_000;
const PROBE_OTHER_MS = 5_000;
const PUBLIC_RESOLVERS = ["1.1.1.1", "1.0.0.1"];

export const QUICK_TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function getStatus(url, { timeoutMs, lookup, servername } = {}) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(url, { timeout: timeoutMs, lookup, servername, headers: { "cache-control": "no-cache" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body.length < 4096 ? (body += chunk) : null));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ status: 0, error: error.message }));
  });
}

// cloudflared's metrics server answers /ready with 200 once it holds at least one edge connection.
export async function cloudflaredReady(metricsPort) {
  const result = await getStatus(`http://127.0.0.1:${metricsPort}/ready`, { timeoutMs: 3_000 });
  return result.status === 200;
}

// Resolves through public resolvers so a negative answer cached by the Mac does not hide a working tunnel.
async function resolvePublic(host) {
  const resolver = new dns.promises.Resolver({ timeout: 3_000, tries: 1 });
  resolver.setServers(PUBLIC_RESOLVERS);
  const addresses = await resolver.resolve4(host);
  if (!addresses.length) throw new Error(`no address for ${host}`);
  return addresses[0];
}

async function resolveSystem(host) {
  try {
    await dns.promises.lookup(host);
    return true;
  } catch {
    return false;
  }
}

// One health check of the public link: cloudflared connected, the URL answers through public DNS, and
// (only then, so the Mac never caches a negative answer for a fresh host) whether the local resolver knows it.
export async function probeLink({ metricsPort, url }) {
  if (!(await cloudflaredReady(metricsPort))) return { ok: false, localDns: false, error: "cloudflared has no edge connection" };
  if (!url) return { ok: false, localDns: false, error: "no public URL yet" };
  const { hostname } = new URL(url);
  let address;
  try {
    address = await resolvePublic(hostname);
  } catch (error) {
    return { ok: false, localDns: false, error: `public DNS: ${error.code || error.message}` };
  }
  const lookup = (_host, options, callback) => (options?.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4));
  const probeUrl = new URL("/api/agent/status", url);
  probeUrl.searchParams.set("health", Date.now().toString(36));
  const result = await getStatus(probeUrl.href, { timeoutMs: 8_000, lookup, servername: hostname });
  if (result.status !== 200) return { ok: false, localDns: false, error: `public link answered ${result.status || result.error}` };
  return { ok: true, localDns: await resolveSystem(hostname) };
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}

export function readShareState(paths) {
  try {
    return JSON.parse(readFileSync(paths.shareState, "utf8"));
  } catch {
    return null;
  }
}

// The state file belongs to a running supervisor only while its heartbeat is fresh and its process lives.
export function supervisorAlive(state, now = Date.now()) {
  if (!state?.pid || !state.heartbeatAt) return false;
  try {
    process.kill(state.pid, 0);
  } catch (error) {
    if (error.code !== "EPERM") return false;
  }
  return now - Date.parse(state.heartbeatAt) < 60_000;
}

/**
 * Starts supervising. `spawnTunnel(metricsPort)` returns a ChildProcess; tests inject a fake one and a
 * fake `probe`. Returns { stop(): Promise<void>, state() }.
 */
export function startShareSupervisor({ paths, config, origin, log = () => {}, spawnTunnel, probe = probeLink, now = Date.now }) {
  const { cloudflareTunnelToken: token, cloudflarePublicUrl: namedUrl } = config.share;
  const named = Boolean(token);
  let state = initialState();
  let child = null;
  let metricsPort = null;
  let probing = false;
  let lastProbeAt = 0;
  let lastTickAt = now();
  let stopped = false;

  const spawnDefault = (port, { protocol }) => {
    const common = ["tunnel", "--no-autoupdate", "--metrics", `127.0.0.1:${port}`, ...(protocol ? ["--protocol", protocol] : [])];
    const args = named ? [...common, "run"] : [...common, "--url", origin];
    // The token goes through the environment, never the command line (visible in `ps`).
    const env = named ? { ...process.env, TUNNEL_TOKEN: token } : process.env;
    return spawn("cloudflared", args, { detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], env, shell: process.platform === "win32" });
  };
  const spawnImpl = spawnTunnel ?? spawnDefault;

  const publish = () => {
    if (stopped) return;
    try {
      writeJsonAtomic(paths.shareState, {
        ...publicView(state),
        pid: process.pid,
        heartbeatAt: new Date(now()).toISOString(),
        intent: existsSync(paths.shareIntent),
        tunnel: named ? "named" : "quick",
      });
    } catch (error) {
      log(`share: cannot write state: ${error.message}`);
    }
  };

  const signal = (current, name) => {
    try {
      if (process.platform === "win32") current.kill();
      else process.kill(-current.pid, name);
    } catch {
      try {
        current.kill(name);
      } catch {
        /* already gone */
      }
    }
  };
  const killChild = ({ escalate = true } = {}) => {
    const current = child;
    child = null;
    if (!current || current.exitCode !== null || current.signalCode) return;
    signal(current, "SIGTERM");
    // A hung (or stopped) cloudflared ignores SIGTERM; never leave it holding the tunnel.
    if (escalate) setTimeout(() => current.exitCode === null && !current.signalCode && signal(current, "SIGKILL"), 3_000).unref();
  };

  const spawnChild = async () => {
    metricsPort = await freePort();
    if (stopped || state.status === "off") return;
    // Restarts alternate the transport: some networks drop QUIC (UDP) after a sleep, others HTTP/2.
    const protocol = state.attempt === 0 ? null : state.attempt % 2 === 1 ? "http2" : "quic";
    const current = spawnImpl(metricsPort, { protocol });
    child = current;
    const recent = []; // last error lines, reported when the process exits
    const onLine = (line) => {
      if (process.env.WHITEBOARD_STUDIO_VERBOSE) log(`[cloudflared] ${line}`);
      if (/\b(ERR|error|failed)\b/i.test(line)) {
        recent.push(line.replace(/^\S+\s+(ERR|INF|WRN)\s+/, "").slice(0, 300));
        if (recent.length > 3) recent.shift();
      }
      const match = !named && line.match(QUICK_TUNNEL_URL);
      if (match && child === current) dispatch({ type: "url", url: match[0] });
    };
    for (const stream of [current.stdout, current.stderr].filter(Boolean)) {
      let buffer = "";
      stream.setEncoding?.("utf8");
      stream.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        lines.forEach(onLine);
      });
    }
    const gone = (reason) => {
      if (child !== current) return; // a process we replaced or stopped
      child = null;
      dispatch({ type: "exited", reason });
    };
    current.on("error", (error) => gone(error.code === "ENOENT" ? "cloudflared not found in PATH" : error.message));
    current.on("exit", (code, signal) => gone(`cloudflared exited (${signal || code})${recent.length ? `: ${recent.at(-1)}` : ""}`));
    if (named) dispatch({ type: "url", url: namedUrl ? new URL(namedUrl).origin : null });
    log(`share: cloudflared started${protocol ? ` (${protocol})` : ""}`);
  };

  function dispatch(event) {
    if (stopped) return;
    const before = state.status;
    const result = step(state, { now: now(), ...event });
    state = result.state;
    for (const action of result.actions) {
      if (action === "kill") killChild();
      else if (action === "spawn") {
        killChild();
        spawnChild().catch((error) => dispatch({ type: "exited", reason: error.message }));
      } else if (action === "probe") lastProbeAt = 0;
    }
    if (state.status !== before) log(`share: ${before} -> ${state.status}${state.status === "ready" ? ` ${state.url}` : state.lastError ? ` (${state.lastError})` : ""}`);
    publish();
  }

  const runProbe = async () => {
    if (probing || !child || !metricsPort || state.status === "off") return;
    probing = true;
    lastProbeAt = now();
    const target = child;
    try {
      const result = await probe({ metricsPort, url: state.url });
      if (child === target) dispatch({ type: "probe", ...result });
    } finally {
      probing = false;
    }
  };

  const tick = () => {
    const t = now();
    if (t - lastTickAt > WAKE_GAP_MS) {
      log(`share: wake detected (${Math.round((t - lastTickAt) / 1000)} s gap)`);
      dispatch({ type: "wake" });
    }
    lastTickAt = t;
    const wanted = existsSync(paths.shareIntent);
    if (wanted && state.status === "off") dispatch({ type: "enable" });
    else if (!wanted && state.status !== "off") dispatch({ type: "disable" });
    if (existsSync(paths.shareRestart)) {
      rmSync(paths.shareRestart, { force: true });
      dispatch({ type: "restart" });
    }
    dispatch({ type: "tick" });
    const every = state.status === "ready" ? PROBE_READY_MS : PROBE_OTHER_MS;
    if (t - lastProbeAt >= every) void runProbe();
  };

  publish();
  tick();
  const timer = setInterval(tick, TICK_MS);
  return {
    state: () => publicView(state),
    tick,
    // Synchronous last resort for process.on("exit").
    killNow: () => {
      const current = child;
      killChild({ escalate: false });
      if (current) signal(current, "SIGKILL");
    },
    async stop() {
      clearInterval(timer);
      const current = child;
      killChild();
      stopped = true;
      if (current && current.exitCode === null && !current.signalCode) {
        await new Promise((resolve) => {
          current.once("exit", resolve);
          setTimeout(resolve, 3_000).unref();
        });
      }
      rmSync(paths.shareState, { force: true });
    },
  };
}
