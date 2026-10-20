import http from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, access, readdir, copyFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import httpProxy from "http-proxy";
import { guestMayReadAsset } from "./lib/board-assets.mjs";
import { agentRouteAccess, canonicalPath, isLabPath, isRemoteRequest } from "./lib/remote-request.mjs";
import { labPaths, loadConfig, ensureDataDirs } from "./lib/lab-config.mjs";
import {
  chatModel,
  imageModel,
  chatConfigured,
  imageConfigured,
  piArgs,
  codexTextArgs,
  codexImageArgs,
  claudeArgs,
  runOpenAiCompatible,
  redact,
  buildChatPrompt,
  chatPromptWithImagePolicy,
  PROVIDER_TIMEOUT_MS,
} from "./lib/agent-providers.mjs";

const projectDir = path.resolve(import.meta.dirname, "..");
const paths = ensureDataDirs(labPaths());
const enabledFile = paths.agentEnabled;
const messagesFile = paths.messages;
const assetsDir = paths.assets;
const jobsDir = paths.jobs;
const startConfig = loadConfig(paths);
const port = Number(process.env.AGENT_BRIDGE_PORT || startConfig.share.bridgePort || 4174);
const host = process.env.AGENT_BRIDGE_HOST || "127.0.0.1";
const appTarget = process.env.WHITEBOARD_STUDIO_APP_ORIGIN || `http://localhost:${startConfig.share.port || 4173}`;
// Read per request so edits to config.json apply without restarting the bridge.
function currentConfig() {
  try {
    return loadConfig(paths);
  } catch {
    return startConfig;
  }
}
const proxy = httpProxy.createProxyServer({ target: appTarget, ws: true, changeOrigin: false });
const queue = [];
let processing = false;

const diagramRouterRules = await readFile(path.join(projectDir, "DIAGRAM_ROUTER.md"), "utf8");
const diagramVisualStyle = await readFile(path.join(projectDir, "VISUAL_STYLE_GUIDE.md"), "utf8");

async function enabled() {
  try {
    await access(enabledFile);
    return true;
  } catch {
    return false;
  }
}
async function messages() {
  try {
    return JSON.parse(await readFile(messagesFile, "utf8"));
  } catch {
    return [];
  }
}
async function saveMessages(items) {
  await writeFile(messagesFile, JSON.stringify(items.slice(-100), null, 2));
}
function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function bodyJson(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 1_000_000) throw new Error("Request too large");
  }
  return JSON.parse(text || "{}");
}
async function bodyBuffer(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 50_000_000) throw new Error("Asset too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function isImageRequest(text) {
  const value = text.toLowerCase();
  if (/diagram|chart|graph|flowchart|sequence|flowchart|architecture|mind.?map/.test(value)) return false;
  return /picture|image\b|illustrat|photo|portrait|mascot|sticker|avatar|logo|pencil|watercolor|artwork|\bart\b|draw me|generate/.test(value);
}

function runProcess(command, args, { cwd, input, timeoutMs = PROVIDER_TIMEOUT_MS, label, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: env ?? process.env, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], shell: false });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${label} timeout`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(error.code === "ENOENT" ? `Command ${command} not found in PATH` : error.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `${label} exited with ${code}`));
    });
    if (input !== undefined) {
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
  });
}

async function runPi(prompt, chat) {
  const { stdout } = await runProcess("pi", piArgs(prompt, chatModel(chat)), { cwd: projectDir, label: "Pi" });
  if (!stdout.trim()) throw new Error("Pi returned an empty response");
  return { text: stdout.trim(), images: [] };
}

async function runClaude(prompt, chat) {
  const { args } = claudeArgs({ model: chatModel(chat) });
  const { stdout } = await runProcess("claude", args, { cwd: jobsDir, input: prompt, label: "Claude" });
  if (!stdout.trim()) throw new Error("Claude returned an empty response");
  return { text: stdout.trim(), images: [] };
}

async function runCodexText(prompt, chat, jobId) {
  const jobDir = path.join(jobsDir, `${jobId}-chat`);
  const responseFile = path.join(jobDir, "response.txt");
  await mkdir(jobDir, { recursive: true });
  await runProcess("codex", codexTextArgs(prompt, { model: chatModel(chat), jobDir, responseFile }), { label: "Codex", env: codexEnv() });
  const text = (await readFile(responseFile, "utf8")).trim();
  if (!text) throw new Error("Codex returned an empty response");
  return { text, images: [] };
}

function codexEnv() {
  return { ...process.env, CODEX_HOME: process.env.CODEX_HOME || path.join(os.homedir(), ".codex") };
}

async function runChat(prompt, chat, jobId) {
  switch (chat.provider) {
    case "pi":
      return await runPi(prompt, chat);
    case "claude":
      return await runClaude(prompt, chat);
    case "codex":
      return await runCodexText(prompt, chat, jobId);
    case "openai-compatible":
      return await runOpenAiCompatible(chat, prompt);
    default:
      throw new Error("Chat provider is not configured");
  }
}

async function removeImageBackground(input, output) {
  const helper = backgroundHelper();
  if (!helper) {
    await copyFile(input, output);
    return false;
  }
  await new Promise((resolve, reject) => {
    const child = spawn("python3", [helper, "--input", input, "--out", output, "--auto-key", "border", "--soft-matte", "--transparent-threshold", "16", "--opaque-threshold", "210", "--despill"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `background removal exited with ${code}`))));
  });
  return true;
}
function backgroundHelper() {
  const helper = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "skills/.system/imagegen/scripts/remove_chroma_key.py");
  return existsSync(helper) ? helper : null;
}

async function runCodex(prompt, jobId, image) {
  const jobDir = path.join(jobsDir, jobId);
  const responseFile = path.join(jobDir, "response.txt");
  await mkdir(jobDir, { recursive: true });
  const fullPrompt = `${prompt}\n\nYou are running inside Codex CLI. For every raster image, you MUST use built-in image_gen and create the subject isolated on a perfectly flat solid chroma-key background (#00ff00 unless the subject contains green; then use #ff00ff). There must never be a white, off-white, scenic, textured, gradient, shadowed, or opaque background. Keep generous clear padding around the subject and do not use the key color in it. Copy every final selected PNG/JPEG/WebP into this exact directory before answering: ${jobDir}. The bridge will always remove the chroma key and publish a transparent PNG. Do not edit source code or files outside this job directory. In the final answer, never expose local filesystem paths, markdown file links, implementation status templates, or copying instructions; simply say what transparent image was created.`;
  await runProcess("codex", codexImageArgs(fullPrompt, { model: imageModel(image), jobDir, responseFile }), { label: "Codex", env: codexEnv() });
  const text = (await readFile(responseFile, "utf8")).trim();
  const files = (await readdir(jobDir, { withFileTypes: true })).filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name));
  const images = [];
  let keptBackground = false;
  for (const file of files) {
    const name = `${jobId}-${crypto.randomUUID()}.png`;
    const publishedPath = path.join(assetsDir, name);
    if (!(await removeImageBackground(path.join(jobDir, file.name), publishedPath))) keptBackground = true;
    images.push({ name: `${path.parse(file.name).name}.png`, url: `/api/agent/assets/${name}` });
  }
  if (!text && !images.length) throw new Error("Codex returned an empty response");
  const note = keptBackground ? "\n\nCould not remove the background (no Codex background-removal helper available); the image was published as is." : "";
  return { text: (text || `Images created: ${images.length}`) + note, images };
}
function needsImageHandoff(text) {
  return /__CODEX_IMAGE_HANDOFF__/.test(text) || /image_gen|generation[^.]{0,40}unavailable|(?:can't|cannot|unable to).{0,40}(?:image|picture)/i.test(text);
}
function extractPatch(text) {
  const match = text.match(/```tldraw-patch\s*([\s\S]*?)```/i);
  if (!match) return null;
  try {
    const patch = JSON.parse(match[1]);
    return patch?.format === "whiteboard-studio/v1" && Array.isArray(patch.nodes) ? patch : null;
  } catch {
    return null;
  }
}
async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      const items = await messages();
      try {
        const prompt = buildChatPrompt({
          roomId: job.roomId,
          text: job.text,
          board: job.board,
          history: items
            .filter((item) => item.roomId === job.roomId)
            .slice(-12)
            .map(({ role, text }) => ({ role, text })),
          routerRules: diagramRouterRules,
          visualStyle: diagramVisualStyle,
        });
        const config = currentConfig();
        const { chat, image } = config.agent;
        if (!chatConfigured(chat)) throw new Error("Chat provider is not configured (agent.chat.provider)");
        const canImage = imageConfigured(image);
        const wantsImage = isImageRequest(job.text);
        let result;
        if (wantsImage && canImage) result = await runCodex(prompt, job.id, image);
        else {
          result = await runChat(chatPromptWithImagePolicy(prompt, wantsImage), chat, job.id);
          if (!result.images.length && needsImageHandoff(result.text)) {
            result = canImage ? await runCodex(prompt, job.id, image) : await runChat(chatPromptWithImagePolicy(prompt, true), chat, job.id);
          }
        }
        items.push({
          id: crypto.randomUUID(),
          roomId: job.roomId,
          role: "assistant",
          text: result.text.replace(/```tldraw-patch[\s\S]*?```/gi, "").trim() || "Changes prepared.",
          patch: extractPatch(result.text),
          images: result.images,
          at: new Date().toISOString(),
          replyTo: job.id,
        });
      } catch (error) {
        items.push({
          id: crypto.randomUUID(),
          roomId: job.roomId,
          role: "assistant",
          text: `Agent error: ${redact(error.message, currentConfig().agent.chat)}`,
          error: true,
          at: new Date().toISOString(),
          replyTo: job.id,
        });
      }
      await saveMessages(items);
    }
  } finally {
    processing = false;
  }
}

const FORBIDDEN = { message: "Forbidden" };

/** Decides before any handler runs. Returns true when the request was refused (response already sent). */
async function refuse(req, res, url) {
  const canonical = canonicalPath(req.url);
  const remote = isRemoteRequest(req);
  if (canonical === null) {
    json(res, 400, { message: "Invalid request" });
    return true;
  }
  // Board snapshots and revisions are for this computer only, not for LAN or tunnel guests.
  if (remote && isLabPath(canonical)) {
    json(res, 403, FORBIDDEN);
    return true;
  }
  if (!remote) return false;
  // Guests may not reach agent routes through alternate spellings (case, encoding, dot segments).
  if (canonical.startsWith("/api/agent") && !canonical.startsWith("/api/agent/assets/") && url.pathname !== canonical) {
    json(res, 403, FORBIDDEN);
    return true;
  }
  const access = agentRouteAccess({ method: req.method, pathname: url.pathname, remote, agentEnabled: await enabled() });
  if (access === "deny") {
    json(res, 403, FORBIDDEN);
    return true;
  }
  if (access === "minimal") {
    json(res, 200, { enabled: false, chat: { configured: false } });
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return json(res, 400, { message: "Invalid request" });
  }
  try {
    if (await refuse(req, res, url)) return;
    if (url.pathname === "/api/agent/upload" && req.method === "POST") {
      const original = decodeURIComponent(String(req.headers["x-file-name"] || "asset"));
      const safeExt =
        path
          .extname(original)
          .toLowerCase()
          .match(/^\.(png|jpe?g|webp|gif|svg|mp4|webm)$/)?.[0] || "";
      const name = `${crypto.randomUUID()}${safeExt}`;
      await writeFile(path.join(assetsDir, name), await bodyBuffer(req));
      return json(res, 201, { src: `/api/agent/assets/${name}` });
    }
    if (url.pathname.startsWith("/api/agent/assets/") && req.method === "GET") {
      const name = path.basename(decodeURIComponent(url.pathname.slice("/api/agent/assets/".length)));
      if (!name || name !== url.pathname.slice("/api/agent/assets/".length)) return json(res, 400, { message: "Invalid asset" });
      // Guests (tunnel or LAN) get only files a stored board references (see lib/board-assets.mjs); there is no listing.
      if (isRemoteRequest(req) && !(await guestMayReadAsset(paths.root, name, await enabled()))) return json(res, 404, { message: "Not found" });
      try {
        const data = await readFile(path.join(assetsDir, name));
        const contentType = name.endsWith(".png")
          ? "image/png"
          : name.match(/\.webp$/i)
            ? "image/webp"
            : name.endsWith(".gif")
              ? "image/gif"
              : name.endsWith(".svg")
                ? "image/svg+xml"
                : name.endsWith(".mp4")
                  ? "video/mp4"
                  : name.endsWith(".webm")
                    ? "video/webm"
                    : "image/jpeg";
        res.writeHead(200, { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "sandbox" });
        return res.end(data);
      } catch {
        return json(res, 404, { message: "Not found" });
      }
    }
    if (url.pathname === "/api/agent/status" && req.method === "GET") {
      const { chat, image } = currentConfig().agent;
      return json(res, 200, {
        enabled: await enabled(),
        chat: { provider: chat.provider, model: chatModel(chat), configured: chatConfigured(chat) },
        image: { provider: image.provider, model: imageModel(image), configured: imageConfigured(image) },
        busy: processing,
        queued: queue.length,
        model: chatModel(chat),
        imageModel: imageModel(image),
      });
    }
    if (url.pathname === "/api/agent/messages" && req.method === "GET") {
      const roomId = url.searchParams.get("roomId") || "";
      return json(res, 200, { messages: (await messages()).filter((item) => item.roomId === roomId) });
    }
    if (url.pathname === "/api/agent/messages" && req.method === "DELETE") {
      if (processing || queue.length) return json(res, 409, { message: "Agent is busy" });
      const roomId = url.searchParams.get("roomId") || "";
      await saveMessages((await messages()).filter((item) => item.roomId !== roomId));
      return json(res, 200, { reset: true });
    }
    if (url.pathname === "/api/agent/claim" && req.method === "POST") {
      const input = await bodyJson(req);
      const items = await messages();
      const item = items.find((entry) => entry.id === input.id && (entry.patch || entry.images?.length));
      if (!item || item.claimedAt) return json(res, 409, { claimed: false });
      item.claimedAt = new Date().toISOString();
      await saveMessages(items);
      return json(res, 200, { claimed: true, patch: item.patch ?? null, images: item.images ?? [] });
    }
    if (url.pathname === "/api/agent/chat" && req.method === "POST") {
      if (!chatConfigured(currentConfig().agent.chat)) return json(res, 503, { enabled: false, configured: false, message: "Chat agent is not configured: set agent.chat.provider in config.json" });
      if (!(await enabled())) return json(res, 503, { enabled: false, message: "Agent is disabled by the owner" });
      const input = await bodyJson(req);
      if (!input.roomId || !input.text?.trim()) return json(res, 400, { message: "roomId and text are required" });
      const item = { id: crypto.randomUUID(), roomId: String(input.roomId), role: "user", text: String(input.text).trim().slice(0, 10_000), at: new Date().toISOString() };
      const items = await messages();
      items.push(item);
      await saveMessages(items);
      queue.push({ ...item, board: Array.isArray(input.board) ? input.board.slice(0, 500) : [] });
      void processQueue();
      return json(res, 202, { accepted: true, id: item.id });
    }
    proxy.web(req, res, {}, (error) => json(res, 502, { message: error.message }));
  } catch (error) {
    json(res, 500, { message: error.message });
  }
});
// A restarting app server resets proxied sockets; drop that client instead of crashing the bridge.
proxy.on("error", (error, _req, target) => {
  console.warn(`proxy error: ${error.message}`);
  if (target && typeof target.destroy === "function" && !target.writeHead) target.destroy();
});
server.on("upgrade", (req, socket, head) => {
  socket.on("error", () => socket.destroy());
  const canonical = canonicalPath(req.url);
  if (canonical === null || (isRemoteRequest(req) && (isLabPath(canonical) || canonical.startsWith("/api/agent")))) return socket.destroy();
  proxy.ws(req, socket, head, {}, () => socket.destroy());
});
server.listen(port, host, () => console.log(`Agent bridge on http://${host}:${port} -> ${appTarget}`));
