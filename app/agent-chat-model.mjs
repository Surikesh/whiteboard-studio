// Pure state and copy for the agent chat and its settings panel (unit-tested in tests/agent-chat-model.test.mjs).
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

export function chatSubtitle({ configured, enabled, busy }) {
  if (!configured) return "no provider configured";
  if (!enabled) return "agent access is off";
  return busy ? "agent is working…" : "ready to help";
}

export function chatHint({ configured, enabled }) {
  if (!configured) return "No AI provider is configured yet. Collaborative editing works without one.";
  if (!enabled) return "Agent access is off. Turn it on with: npm run lab -- agent on";
  return "Describe a diagram and the agent will draw it on the canvas.";
}

/** Graphite exists only while the agent works (the `working` flag of chatState); this is the single render-boundary decision. */
export const buddyOn = (working) => Boolean(working);

/** A spell request while the agent is idle is declined, so the board never resurrects a hidden Graphite. */
export const buddyAcceptsCast = (working) => Boolean(working);

/** Every Graphite pose and how it is reached while the agent works (verified against pencil-buddy.tsx in tests). There is no after-work state. */
export const POSE_TRIGGERS = {
  idle: "opening stunt on the chat edge",
  "chute-fail": "opening stunt (tangled parachute)",
  jump: "opening stunt",
  fall: "opening stunt",
  splat: "opening stunt",
  roll: "opening stunt",
  launch: "opening stunt, and after the cheer",
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
  cheer: "agent patch applied while working",
  wave: "after the cheer",
  "wand-out": "image spell accepted while working",
  "wand-up": "image spell accepted while working",
  cast: "image spell accepted while working",
  flick: "image spell accepted while working",
};
