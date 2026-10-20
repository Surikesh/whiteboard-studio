#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { labBaseUrl } from "./lib/base-url.mjs";

const [command, source, destination] = process.argv.slice(2);
if (command !== "save" || !source) {
  console.error("Usage: node scripts/diagram.mjs save <spec.json> [name]");
  process.exit(2);
}

const spec = JSON.parse(await readFile(resolve(source), "utf8"));
if (spec?.format !== "whiteboard-studio/v1" || !Array.isArray(spec.nodes)) {
  throw new Error('Expected { "format": "whiteboard-studio/v1", "nodes": [...] }');
}
const nodeIds = new Set();
for (const node of spec.nodes) {
  if (!node?.id || !node?.label || !Number.isFinite(node.x) || !Number.isFinite(node.y)) {
    throw new Error("Every node needs id, label, x, and y");
  }
  if (nodeIds.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`);
  nodeIds.add(node.id);
}
for (const edge of spec.edges ?? []) {
  if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
    throw new Error(`Unknown edge endpoint: ${edge.from} -> ${edge.to}`);
  }
}
if (spec.diagramType === "sequence") {
  const participants = spec.sequence?.participants;
  const messages = spec.sequence?.messages;
  if (!Array.isArray(participants) || participants.length < 2 || !Array.isArray(messages)) {
    throw new Error("A sequence diagram needs at least two participants and a messages array");
  }
  const participantIds = new Set(participants.map((participant) => participant.id));
  if (participantIds.size !== participants.length || participants.some((participant) => !participant.id || !participant.label)) {
    throw new Error("Sequence participants need unique id and label values");
  }
  for (const message of messages) {
    if (!participantIds.has(message.from) || !participantIds.has(message.to) || !message.label) {
      throw new Error(`Invalid sequence message: ${message.from} -> ${message.to}`);
    }
    if (message.from === message.to) throw new Error(`Self messages are not supported yet: ${message.from}`);
    if (message.label.length > 32) throw new Error(`Sequence message label is too long (${message.label.length}): ${message.label}`);
  }
}

const safeName = (destination ?? basename(source, ".json")).replace(/\.diagram$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
const directory = resolve("public/diagrams");
const output = resolve(directory, `${safeName}.diagram.json`);
await mkdir(directory, { recursive: true });
await writeFile(output, `${JSON.stringify(spec, null, 2)}\n`);
console.log(output);
console.log(`${labBaseUrl()}/?diagram=/diagrams/${encodeURIComponent(`${safeName}.diagram.json`)}`);
