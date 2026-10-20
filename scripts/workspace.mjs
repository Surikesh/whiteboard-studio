#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { labBaseUrl } from "./lib/base-url.mjs";

const root = resolve(import.meta.dirname, "..");
const indexPath = resolve(root, "public/workspace/index.json");
const diagramsDir = resolve(root, "public/diagrams");
const [command, ...args] = process.argv.slice(2);

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
async function index() {
  return readJson(indexPath, []);
}
async function saveIndex(items) {
  await mkdir(resolve(root, "public/workspace"), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(items, null, 2)}\n`);
}
function id() {
  return `td_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function usage() {
  console.error("workspace: list | show <id> | create <spec.json> [--title title] [--project project] | patch <id> <patch.json> | open <id> [--print]");
  process.exit(2);
}
function option(name, fallback = "") {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
}

if (command === "list") {
  const items = await index();
  for (const item of items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) console.log(`${item.id}\t${item.title}\t${item.project}\t${item.updatedAt}`);
} else if (command === "show") {
  const item = (await index()).find((entry) => entry.id === args[0]);
  if (!item) throw new Error(`Unknown document: ${args[0]}`);
  const spec = await readJson(resolve(root, `public${item.sourceUrl}`), null);
  console.log(JSON.stringify({ ...item, spec }, null, 2));
} else if (command === "create") {
  if (!args[0]) usage();
  const spec = await readJson(resolve(args[0]), null);
  if (spec?.format !== "whiteboard-studio/v1" || !Array.isArray(spec.nodes))
    throw new Error(
      `Expected a whiteboard-studio/v1 spec: "format" must be "whiteboard-studio/v1" and "nodes" must be an array (got format=${JSON.stringify(spec?.format)}, nodes=${Array.isArray(spec?.nodes) ? "array" : typeof spec?.nodes}). Try public/diagrams/demo-web-architecture.diagram.json`,
    );
  const documentId = id();
  const title = option("title", spec.title || "New diagram");
  const now = new Date().toISOString();
  await mkdir(diagramsDir, { recursive: true });
  await writeFile(resolve(diagramsDir, `${documentId}.diagram.json`), `${JSON.stringify({ ...spec, title }, null, 2)}\n`); // the canvas heading comes from the spec title, so keep it equal to the board title
  const item = {
    id: documentId,
    title,
    project: option("project", "No project"),
    tags: [],
    status: "draft",
    nextStep: "",
    createdAt: now,
    updatedAt: now,
    sourceUrl: `/diagrams/${documentId}.diagram.json`,
  };
  await saveIndex([item, ...(await index())]);
  console.log(JSON.stringify({ id: documentId, url: `${labBaseUrl()}/d/${documentId}` }, null, 2));
} else if (command === "patch") {
  const [documentId, patchFile] = args;
  if (!documentId || !patchFile) usage();
  const items = await index();
  const at = items.findIndex((item) => item.id === documentId);
  if (at < 0) throw new Error(`Unknown document: ${documentId}`);
  const patch = await readJson(resolve(patchFile), null);
  const item = items[at];
  const specPath = resolve(root, `public${item.sourceUrl}`);
  const spec = await readJson(specPath, null);
  const nextSpec = patch.spec ?? {
    ...spec,
    ...(patch.title ? { title: patch.title } : {}),
    nodes: [...(spec.nodes ?? []), ...(patch.addNodes ?? [])],
    edges: [...(spec.edges ?? []), ...(patch.addEdges ?? [])],
  };
  if (nextSpec?.format !== "whiteboard-studio/v1" || !Array.isArray(nextSpec.nodes)) throw new Error("Patch produced an invalid spec");
  const ids = new Set(nextSpec.nodes.map((node) => node.id));
  if (ids.size !== nextSpec.nodes.length) throw new Error("Patch produced duplicate node IDs");
  for (const edge of nextSpec.edges ?? []) if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error(`Unknown edge endpoint: ${edge.from} -> ${edge.to}`);
  await writeFile(specPath, `${JSON.stringify(nextSpec, null, 2)}\n`);
  items[at] = { ...item, ...(patch.metadata ?? {}), updatedAt: new Date().toISOString() };
  await saveIndex(items);
  console.log(`${labBaseUrl()}/d/${documentId}`);
} else if (command === "open") {
  const item = (await index()).find((entry) => entry.id === args[0]);
  if (!item) throw new Error(`Unknown document: ${args[0]}`);
  const url = `${labBaseUrl()}/d/${item.id}`;
  console.log(url);
  if (process.platform === "darwin" && !args.includes("--print")) spawnSync("open", [url], { stdio: "ignore" });
} else usage();
