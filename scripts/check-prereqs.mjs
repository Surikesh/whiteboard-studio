#!/usr/bin/env node
// Prerequisite check for `npm run setup`, `npm start` and `npm run dev`.
// Usage: node scripts/check-prereqs.mjs setup|run
// Kept free of project imports and of APIs newer than Node 14 (no import.meta.dirname, no structuredClone)
// so it can report a wrong Node cleanly.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIN_NODE = [22, 13, 0];
const MIN_NPM_MAJOR = 10;
const mode = process.argv[2] === "setup" ? "setup" : "run";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

function atLeast(actual, minimum) {
  for (let i = 0; i < minimum.length; i++) {
    if ((actual[i] || 0) !== minimum[i]) return (actual[i] || 0) > minimum[i];
  }
  return true;
}

const node = process.versions.node.split(".").map(Number);
if (!atLeast(node, MIN_NODE)) {
  problems.push(`Node.js ${MIN_NODE.join(".")} or newer is required, found ${process.versions.node}. Install Node 22 (nvm use, or https://nodejs.org) and run the command again.`);
}

const npm = spawnSync("npm", ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
if (npm.status !== 0) {
  problems.push("npm was not found on PATH. It ships with Node.js: reinstall Node 22 from https://nodejs.org.");
} else if (Number(npm.stdout.trim().split(".")[0]) < MIN_NPM_MAJOR) {
  problems.push(`npm ${MIN_NPM_MAJOR} or newer is required, found ${npm.stdout.trim()}. Run: npm install -g npm@latest`);
}

if (mode === "run" && !existsSync(path.join(root, "node_modules", ".bin", "vinext"))) {
  problems.push("Dependencies are not installed. Run: npm run setup");
}

if (problems.length) {
  console.error("Whiteboard Studio prerequisite check failed:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}
if (mode === "setup") console.log(`Prerequisites OK (Node ${process.versions.node}, npm ${npm.stdout.trim()}).`);
