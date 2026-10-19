#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { labBaseUrl } from "./lib/base-url.mjs";

const [workspaceId, configFile, outputPrefix = "/tmp/tldraw-layout"] = process.argv.slice(2);
if (!workspaceId || !configFile) {
  console.error("Usage: node scripts/workspace-layout.mjs <td_id> <groups.json> [output-prefix]");
  process.exit(2);
}
const config = JSON.parse(await readFile(resolve(configFile), "utf8"));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || process.env.PLAYWRIGHT_CHROME || undefined,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(`${labBaseUrl()}/d/${encodeURIComponent(workspaceId)}`);
await page.waitForFunction(() => window.__tldrawEditor?.getCurrentPageShapes().length > 0, null, { timeout: 20_000 });
await page.waitForTimeout(2500);

const report = await page.evaluate(
  (config) => {
    const editor = window.__tldrawEditor;
    if (!editor) throw new Error("Realtime editor hook is unavailable");
    const shapeIds = [...editor.getCurrentPageShapeIds()];
    const resolveId = (token) => {
      const found = shapeIds.find((id) => String(id).includes(token));
      if (!found) throw new Error(`Shape not found: ${token}`);
      return found;
    };
    for (const size of config.shapeSizes ?? []) {
      const id = resolveId(size.shape);
      const shape = editor.getShape(id);
      editor.updateShape({ id, type: shape.type, props: { ...(size.w ? { w: size.w } : {}), ...(size.h ? { h: size.h } : {}) } });
    }
    const results = [];
    const groupBounds = new Map();
    for (const group of config.groups) {
      const ids = group.shapes.map(resolveId);
      editor.alignShapes(ids, group.align ?? "left");
      editor.stackShapes(ids, group.axis ?? "vertical", group.gap ?? config.minimumGap);
      const bounds = ids.map((id) => ({ id, bounds: editor.getShapePageBounds(id) }));
      const sorted = [...bounds].sort((a, b) => a.bounds.y - b.bounds.y);
      const gaps = sorted.slice(1).map((item, index) => item.bounds.y - (sorted[index].bounds.y + sorted[index].bounds.h));
      const lefts = bounds.map((item) => item.bounds.x);
      const rights = bounds.map((item) => item.bounds.x + item.bounds.w);
      const union = { x: Math.min(...lefts), y: Math.min(...bounds.map((item) => item.bounds.y)), right: Math.max(...rights), bottom: Math.max(...bounds.map((item) => item.bounds.maxY)) };
      groupBounds.set(group.name, union);
      results.push({ name: group.name, ids, gaps, minimumGap: Math.min(...gaps), leftSpread: Math.max(...lefts) - Math.min(...lefts), rightSpread: Math.max(...rights) - Math.min(...rights) });
    }
    const followerResults = [];
    for (const follower of config.followers ?? []) {
      const id = resolveId(follower.shape);
      const shape = editor.getShape(id);
      const anchor = follower.afterGroup ? groupBounds.get(follower.afterGroup) : editor.getShapePageBounds(resolveId(follower.afterShape));
      const before = editor.getShapePageBounds(id);
      const targetY = anchor.bottom + follower.gap;
      const targetX = follower.centerOnGroup
        ? groupBounds.get(follower.centerOnGroup).x + (groupBounds.get(follower.centerOnGroup).right - groupBounds.get(follower.centerOnGroup).x - before.w) / 2
        : before.x;
      editor.updateShape({ id, type: shape.type, x: shape.x + targetX - before.x, y: shape.y + targetY - before.y });
      const after = editor.getShapePageBounds(id);
      followerResults.push({ id, gap: after.y - anchor.bottom, bounds: { x: after.x, y: after.y, w: after.w, h: after.h, bottom: after.maxY } });
    }
    for (const boundary of config.boundaries ?? []) {
      const id = resolveId(boundary.shape);
      const shape = editor.getShape(id);
      const bounds = editor.getShapePageBounds(id);
      const targets = boundary.contain.map((token) => groupBounds.get(token)?.bottom ?? editor.getShapePageBounds(resolveId(token)).maxY);
      const requiredBottom = Math.max(...targets) + boundary.paddingBottom;
      if (requiredBottom > bounds.maxY) editor.updateShape({ id, type: shape.type, props: { h: shape.props.h + requiredBottom - bounds.maxY } });
    }
    return { groups: results, followers: followerResults };
  },
  { ...config, minimumGap: config.minimumGap ?? 32 },
);

const failures = [
  ...report.groups.filter((group) => group.minimumGap < (config.minimumGap ?? 32) - 0.01 || group.leftSpread > 0.01 || group.rightSpread > 0.01),
  ...report.followers.filter((follower) => follower.gap < (config.minimumGap ?? 32) - 0.01),
];
await page.waitForTimeout(3000);
await page.evaluate(() => {
  window.__tldrawEditor.selectNone();
  window.__tldrawEditor.zoomToFit();
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${outputPrefix}-overview.png` });
for (let index = 0; index < report.groups.length; index++) {
  const ids = report.groups[index].ids;
  await page.evaluate((shapeIds) => {
    const editor = window.__tldrawEditor;
    editor.select(...shapeIds);
    editor.zoomToSelection();
  }, ids);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outputPrefix}-${index + 1}-${report.groups[index].name}.png` });
}
await writeFile(`${outputPrefix}-report.json`, `${JSON.stringify({ workspaceId, minimumGap: config.minimumGap ?? 32, ...report, failures }, null, 2)}\n`);
await browser.close();
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log(`${outputPrefix}-report.json`);
