// Chat/image provider argv and request builders. Pure functions so they can be
// unit-tested without spawning any model.
import { resolveApiKey } from "./lab-config.mjs";

// Neutral placeholders; override with TLDRAW_LAB_PI_MODEL / TLDRAW_LAB_CODEX_MODEL
// (the older TLDRAW_PI_MODEL / TLDRAW_CODEX_MODEL names still work) or in the agent config.
export const DEFAULT_PI_MODEL = "openai-codex/gpt-5";
export const DEFAULT_CODEX_MODEL = "gpt-5";
export const CHAT_PROVIDERS = ["none", "codex", "claude", "pi", "openai-compatible"];
export const IMAGE_PROVIDERS = ["none", "codex"];
export const PROVIDER_TIMEOUT_MS = 600_000;

export function chatModel(chat, env = process.env) {
  const configured = chat.model || "";
  switch (chat.provider) {
    case "pi":
      return configured || env.TLDRAW_LAB_PI_MODEL || env.TLDRAW_PI_MODEL || DEFAULT_PI_MODEL;
    case "codex":
      return configured || env.TLDRAW_LAB_CODEX_MODEL || env.TLDRAW_CODEX_MODEL || DEFAULT_CODEX_MODEL;
    default:
      return configured;
  }
}

export function imageModel(image, env = process.env) {
  if (image.provider !== "codex") return image.model || "";
  return image.model || env.TLDRAW_LAB_CODEX_MODEL || env.TLDRAW_CODEX_MODEL || DEFAULT_CODEX_MODEL;
}

export function chatConfigured(chat) {
  if (chat.provider === "openai-compatible") return Boolean(chat.baseUrl && chat.model);
  return CHAT_PROVIDERS.includes(chat.provider) && chat.provider !== "none";
}

export function imageConfigured(image) {
  return image.provider === "codex";
}

export function piArgs(prompt, model) {
  return ["-p", "--model", model, "--no-session", "--no-tools", "--thinking", "low", "--no-approve", prompt];
}

/** Text-only Codex run: read-only sandbox, nothing persisted. */
export function codexTextArgs(prompt, { model, jobDir, responseFile }) {
  return ["--ask-for-approval", "never", "exec", "--model", model, "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "--output-last-message", responseFile, "-C", jobDir, prompt];
}

/** Image-capable Codex run (writes the generated files into jobDir). */
export function codexImageArgs(prompt, { model, jobDir, responseFile }) {
  return ["--ask-for-approval", "never", "exec", "--model", model, "--ephemeral", "--skip-git-repo-check", "--sandbox", "workspace-write", "--output-last-message", responseFile, "-C", jobDir, prompt];
}

/** `claude -p` without any tools; the prompt is passed on stdin (avoids argv limits). */
export function claudeArgs({ model } = {}) {
  const args = ["-p", "--tools", "", "--output-format", "text"];
  if (model) args.push("--model", model);
  return { args, stdin: true };
}

export function openAiCompatibleUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/, "")}/chat/completions`;
}

export function openAiCompatibleRequest(chat, prompt, env = process.env) {
  const key = resolveApiKey(chat);
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  return {
    url: openAiCompatibleUrl(chat.baseUrl),
    init: { method: "POST", headers, body: JSON.stringify({ model: chat.model, messages: [{ role: "user", content: prompt }] }) },
  };
}

export function redact(text, chat) {
  let value = String(text ?? "");
  const key = chat ? resolveApiKey(chat) : "";
  if (key) value = value.split(key).join("***");
  return value.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1***");
}

export async function runOpenAiCompatible(chat, prompt, { timeoutMs = PROVIDER_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  if (!chat.baseUrl) throw new Error("agent.chat.baseUrl is not set for the openai-compatible provider");
  if (!chat.model) throw new Error("agent.chat.model is not set for the openai-compatible provider");
  const { url, init } = openAiCompatibleRequest(chat, prompt);
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") throw new Error(`Provider did not respond within ${Math.round(timeoutMs / 1000)} s`);
    throw new Error(`Failed to connect to ${chat.baseUrl}: ${redact(error?.cause?.message || error?.message, chat)}`);
  }
  const raw = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || parsed?.message || "";
    } catch {
      detail = raw.slice(0, 200);
    }
    const hint = response.status === 401 || response.status === 403 ? " (check the API key in agent.chat.apiKey / apiKeyEnv)" : "";
    throw new Error(`Provider responded with ${response.status}${hint}${detail ? `: ${redact(detail, chat).slice(0, 300)}` : ""}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Provider returned non-JSON");
  }
  const content = data?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((part) => part?.text ?? "").join("") : String(content ?? "");
  if (!text.trim()) throw new Error("Provider returned an empty response");
  return { text: text.trim(), images: [] };
}

export const NO_IMAGE_INSTRUCTION = `IMPORTANT: raster image generation is NOT available in this installation. Do not try to produce, describe or ASCII-draw a picture, and do not reply with __CODEX_IMAGE_HANDOFF__. Briefly tell the user that image generation is not configured, and offer an editable diagram or illustration built from Tldraw shapes instead; if it makes sense, include a tldraw-patch block that draws it.`;

export function chatPromptWithImagePolicy(prompt, wantsImage) {
  return wantsImage ? `${prompt}\n\n${NO_IMAGE_INSTRUCTION}` : prompt;
}

export function buildChatPrompt({ roomId, text, board, history, routerRules, visualStyle }) {
  return `You are the embedded assistant for a collaborative Tldraw board.
Board ID: ${roomId}
User request: ${text}
Current board summary (possibly truncated): ${JSON.stringify(board).slice(0, 80_000)}
Conversation history for this room: ${JSON.stringify(history).slice(0, 30_000)}

Answer in English, briefly. Never remove or replace existing content.
For diagrams, schemes, architecture, flows, maps, notes, and other editable canvas changes, first infer the explanatory intent and choose the diagram grammar using the routing contract below. The user does not need to know or name the diagram type.

${routerRules}

Apply this mandatory default visual language unless the user explicitly requests another style:

${visualStyle}

For an editable canvas change, append exactly one fenced code block named tldraw-patch containing valid JSON matching those contracts. Use concise labels and coordinates that do not overlap existing shapes. All semantic text must remain editable Tldraw text. Do not produce a patch for ordinary conversation.
For pictorial image requests: when running in Pi without image_gen, do not refuse and do not describe the requested picture. Reply with exactly __CODEX_IMAGE_HANDOFF__ so the bridge can invoke the Codex image-generation skill. When running in Codex, create a polished raster image with built-in image_gen, no ASCII art, and copy it to the requested job directory.`;
}

export function maskConfig(config) {
  const copy = JSON.parse(JSON.stringify(config));
  const mask = (obj, key) => {
    if (obj && obj[key]) obj[key] = "***";
  };
  mask(copy.agent?.chat, "apiKey");
  mask(copy.share, "cloudflareTunnelToken");
  return copy;
}
