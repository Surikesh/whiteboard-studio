import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { POSE_TRIGGERS, SETTINGS_SECTIONS, buddyAcceptsCast, buddyOn, chatHint, chatState, chatSubtitle } from "../app/agent-chat-model.mjs";
import { CHAT_PROVIDERS } from "../scripts/lib/agent-providers.mjs";
import { defaultConfig } from "../scripts/lib/lab-config.mjs";

test("no provider: hint state, buddy hidden", () => {
  for (const status of [null, {}, { enabled: true, busy: true, chat: { configured: false } }]) {
    const state = chatState(status, true);
    assert.deepEqual(state, { configured: false, enabled: false, busy: false, working: false });
    assert.match(chatHint(state), /No AI provider is configured/);
    assert.equal(chatSubtitle(state), "no provider configured");
  }
});

test("buddy shows only while an enabled agent works", () => {
  const chat = { configured: true };
  assert.equal(chatState({ enabled: false, busy: true, chat }).working, false);
  assert.equal(chatState({ enabled: true, chat }).working, false);
  assert.equal(chatState({ enabled: true, busy: true, chat }).working, true);
  assert.equal(chatState({ enabled: true, queued: 1, chat }).working, true);
  assert.equal(chatState({ enabled: true, chat }, true).working, true);
  assert.equal(chatSubtitle(chatState({ enabled: false, chat })), "agent access is off");
});

test("settings copy names real config keys and carries no secrets or owner wording", () => {
  const text = SETTINGS_SECTIONS.flatMap((section) => section.lines).join("\n");
  for (const key of ["agent.chat.provider", "agent.chat.apiKeyEnv", "share.cloudflareTunnelToken", "WHITEBOARD_STUDIO_DATA_DIR"]) assert.ok(text.includes(key), key);
  for (const provider of CHAT_PROVIDERS) assert.ok(text.includes(provider), provider);
  assert.ok("cloudflareTunnelToken" in defaultConfig.share && "apiKeyEnv" in defaultConfig.agent.chat);
  assert.equal(defaultConfig.agent.chat.provider, "none");
  assert.doesNotMatch(text + chatHint({ configured: false }), /graphite|owner|story|sk-/i);
});

test("Graphite visibility: mounted iff the agent works (render-boundary decision)", () => {
  const working = (status, sending = false) => chatState(status, sending).working;
  const live = { enabled: true, busy: true, chat: { configured: true } };
  const idle = { enabled: true, busy: false, chat: { configured: true } };
  assert.equal(buddyOn(working(idle)), false, "idle");
  assert.equal(buddyOn(working(live)), true, "working");
  assert.equal(buddyOn(working(idle, true)), true, "sending");
  assert.equal(buddyOn(working(null)), false, "no status");
  assert.equal(buddyOn(working({ enabled: false, busy: true, chat: { configured: true } })), false, "agent off");
  assert.equal(buddyOn(working({ enabled: true, busy: true, chat: { configured: false } })), false, "no provider");
  assert.equal(buddyAcceptsCast(working(idle)), false, "cast while idle is declined");
  assert.equal(buddyAcceptsCast(working(live)), true, "cast while working is accepted");
});

test("Graphite keeps all 24 poses, each on a working-only path", () => {
  const source = ["model", "sim", "step", "effects", "pencil-buddy"]
    .map((name) => readFileSync(new URL(`../app/ui/agent-buddy/${name}.${name === "pencil-buddy" ? "tsx" : "ts"}`, import.meta.url), "utf8"))
    .join("\n");
  const poses = [...source.match(/const POSES = \[([\s\S]*?)\] as const/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(poses.length, 24);
  assert.deepEqual([...poses].sort(), Object.keys(POSE_TRIGGERS).sort(), "every pose has a trigger and no trigger is stale");
  for (const pose of poses) {
    assert.match(POSE_TRIGGERS[pose], /\S/);
    assert.ok(source.includes(`"${pose}"`) || pose.startsWith("walk-") || pose.startsWith("sit-"), pose);
    assert.doesNotMatch(POSE_TRIGGERS[pose], /after work|idle agent|finished/i, `${pose} must not need a post-work state`);
  }
  // The cheer -> wave -> launch chain is wired to the working-time milestone and never ends in an unmount.
  assert.match(source, /if \(!cheers \|\| !buddy\.live[^]*?buddy\.pose = "cheer";\s*go\(buddy, "cheer"\)/);
  assert.match(source, /buddy\.phase === "wave"[^]*?go\(buddy, "launch"\)/);
  assert.doesNotMatch(source, /case "leave"|buddy\.exiting|setLeaving|demo/);
});
