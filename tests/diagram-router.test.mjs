import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildChatPrompt, chatPromptWithImagePolicy, NO_IMAGE_INSTRUCTION } from "../scripts/lib/agent-providers.mjs";
import { readLabSource } from "./helpers/lab-source.mjs";

const root = new URL("../", import.meta.url);
const router = await readFile(new URL("DIAGRAM_ROUTER.md", root), "utf8");
const visualStyle = await readFile(new URL("VISUAL_STYLE_GUIDE.md", root), "utf8");
const bridge = await readFile(new URL("scripts/agent-bridge.mjs", root), "utf8");
const editor = await readLabSource();

const diagramTypes = ["concept-map", "flowchart", "sequence", "state", "architecture", "hierarchy", "causal", "argument", "comparison"];

test("router defines every supported explanatory grammar", () => {
  for (const type of diagramTypes) assert.match(router, new RegExp(`\\*\\*${type.replace("-", "[- ]")}\\*\\*|${type}`));
  assert.match(router, /focusQuestion/);
  assert.match(router, /Do not add a synthetic final conclusion/);
});

test("embedded chat injects intent routing and the default visual style", () => {
  assert.match(bridge, /diagramRouterRules/);
  assert.match(bridge, /diagramVisualStyle/);
  assert.match(bridge, /VISUAL_STYLE_GUIDE\.md/);
  assert.doesNotMatch(bridge, /behave as the Pi Tldraw harness and append/);
  const prompt = buildChatPrompt({
    roomId: "room-1",
    text: "draw a flow",
    board: {},
    history: [],
    routerRules: "ROUTER-RULES-MARKER",
    visualStyle: "VISUAL-STYLE-MARKER",
  });
  assert.match(prompt, /first infer the explanatory intent/);
  assert.match(prompt, /ROUTER-RULES-MARKER/);
  assert.match(prompt, /VISUAL-STYLE-MARKER/);
  assert.match(prompt, /Answer in English/);
  assert.equal(chatPromptWithImagePolicy(prompt, false), prompt);
  assert.equal(chatPromptWithImagePolicy(prompt, true), `${prompt}\n\n${NO_IMAGE_INSTRUCTION}`);
});

test("default visual style is icon-led and rejects generic status cards", () => {
  assert.match(visualStyle, /reference style/i);
  assert.doesNotMatch(visualStyle, /td_ms[a-z0-9]{8,}/);
  assert.match(visualStyle, /icon-led `asset` nodes/);
  assert.match(visualStyle, /Never use `service` \/ `service-card` merely because/);
  assert.match(visualStyle, /never hotlink/);
  assert.match(visualStyle, /source\/license/);
});

test("editor accepts semantic diagram and node types", () => {
  for (const type of diagramTypes) assert.match(editor, new RegExp(`\\| \\"${type}\\"`));
  for (const kind of ["decision", "claim", "evidence", "outcome"]) assert.match(editor, new RegExp(`\\| \\"${kind}\\"`));
  assert.match(editor, /geo: node\.kind === "decision" \? "diamond"/);
});
