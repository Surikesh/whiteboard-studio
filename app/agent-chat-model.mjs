// Pure state and copy for the agent chat and its settings panel (unit-tested in tests/agent-chat-model.test.mjs).
import { translate } from "./domain/messages.mjs";

export const OPEN_AGENT_SETTINGS_EVENT = "whiteboard-studio:open-agent-settings";

/** Config names only; values live in the data directory (`~/WhiteboardStudio-data`, `WHITEBOARD_STUDIO_DATA_DIR`) or the environment, never in the repository. */
export const SETTINGS_SECTIONS = [
  {
    title: "AI provider",
    lines: [
      "Edit config.json in the Whiteboard Studio data directory (default ~/WhiteboardStudio-data, override with WHITEBOARD_STUDIO_DATA_DIR).",
      "agent.chat.provider: none (default), pi, codex, claude or openai-compatible.",
      "openai-compatible also needs agent.chat.baseUrl and agent.chat.model, plus agent.chat.apiKeyEnv (the name of an environment variable that holds the key) or agent.chat.apiKey.",
      "Optional: agent.image.provider (none or codex); WHITEBOARD_STUDIO_PI_MODEL and WHITEBOARD_STUDIO_CODEX_MODEL set default models.",
    ],
  },
  {
    title: "Agent access",
    lines: ["The agent is off by default and starts disabled on every launch.", "Turn it on with: npm run lab -- agent on (off with: npm run lab -- agent off)."],
  },
  {
    title: "Cloudflare tunnel",
    lines: [
      "share.mode in config.json: local (default), lan or cloudflare.",
      "share.cloudflareTunnelToken and share.cloudflarePublicUrl are only needed for a named tunnel; without a token a temporary Quick Tunnel is used.",
      "Start with: npm run lab -- start. Anyone with a tunnel URL can edit the board; agent access stays off until you enable it.",
    ],
  },
];

/**
 * Maps the /api/agent/status response (or null when it is unreachable) to what the chat shows.
 * @param {{ enabled?: boolean, busy?: boolean, queued?: number, chat?: { configured?: boolean } } | null} status
 * @param {boolean} sending
 */
export function chatState(status, sending = false) {
  const configured = Boolean(status?.chat?.configured);
  const enabled = configured && Boolean(status?.enabled);
  const busy = configured && Boolean(status?.busy || status?.queued);
  return { configured, enabled, busy, working: enabled && (busy || sending) };
}

export function chatSubtitle({ configured, enabled, busy }, locale = "en") {
  if (!configured) return translate(locale, "chat.subtitleNone");
  if (!enabled) return translate(locale, "chat.subtitleOff");
  return translate(locale, busy ? "chat.subtitleBusy" : "chat.subtitleReady");
}

export function chatHint({ configured, enabled }, locale = "en") {
  if (!configured) return translate(locale, "chat.hintNone");
  if (!enabled) return translate(locale, "chat.hintOff");
  return translate(locale, "chat.hintReady");
}

/** Graphite enters while the agent works, or on a demo page (`?buddy=demo`); once that ends he plays an exit and unmounts. */
export const buddyOn = (working, demo = false) => Boolean(working) || Boolean(demo);

/** `?buddy=demo` plays Graphite without an agent; the demo ends this long after the opening stunt and replays on a `pencil-buddy-demo` event. */
export const buddyDemo = (search) => new URLSearchParams(search).get("buddy") === "demo";
export const BUDDY_DEMO_MS = 10000;

/**
 * A spell is accepted whether or not the agent still works: a picture that lands after the work ended brings Graphite back
 * from the top edge, and he leaves again afterwards. Reduced motion and a spell already in flight decline it.
 */
export const buddyAcceptsCast = ({ reduce = false, casting = false } = {}) => !reduce && !casting;

/** How Graphite leaves when work ends: fade with reduced motion, unmount at once while off-screen, fly up while airborne, else cheer, wave and fly up. */
export function buddyExit({ reduce = false, phase }) {
  if (reduce) return "fade";
  if (phase === "void" || phase === "tumble") return "now";
  if (["jump", "chute", "fall", "launch"].includes(phase)) return "leave";
  return "cheer";
}

/** Every Graphite pose and how it is reached (verified against the agent-buddy sources in tests). */
export const POSE_TRIGGERS = {
  idle: "opening stunt on the chat edge",
  "chute-fail": "opening stunt (tangled parachute)",
  jump: "opening stunt",
  fall: "opening stunt",
  splat: "opening stunt",
  roll: "opening stunt",
  launch: "opening stunt, after a mid-work cheer, and flying off when work ends",
  hover: "between wanderings",
  fly: "wandering",
  "walk-1": "wander on the toolbar",
  "walk-2": "wander on the toolbar",
  "walk-3": "wander on the toolbar",
  "walk-4": "wander on the toolbar",
  "walk-5": "wander on the toolbar",
  "walk-6": "wander on the toolbar",
  "sit-1": "sit on the chat",
  "sit-2": "sit on the chat",
  hang: "grab the pointer",
  cheer: "agent patch applied while working, when work ends, and after a late spell",
  wave: "after the cheer",
  "wand-out": "image spell, also for a picture that lands after work (Graphite returns from the top edge)",
  "wand-up": "image spell",
  cast: "image spell",
  flick: "image spell",
};
