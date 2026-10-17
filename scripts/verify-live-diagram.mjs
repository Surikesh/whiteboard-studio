import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

// Matches the URL `npm start` prints by default; override for another port or host.
const base = process.env.LIVE_BASE_URL ?? "http://localhost:3000";
const out = process.env.LIVE_EVIDENCE ?? "outputs/live-diagram";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`${base}/d/td_live_diagram_demo_v1`);
  await page.waitForFunction(() => window.__tldrawEditor?.getCurrentPageShapes().length === 7, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/desktop.png` });
  const layout = await page.evaluate(() => {
    const e = window.__tldrawEditor;
    const nodes = e
      .getCurrentPageShapes()
      .filter((s) => s.type === "live-frame")
      .sort((a, b) => a.x - b.x);
    const boxes = nodes.map((s) => e.getShapePageBounds(s));
    const overlap = (a, b) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
    let nodeOverlap = 0,
      nodeEdgeIntersections = 0,
      bindingFailures = 0;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i], boxes[j])) nodeOverlap++;
    for (const a of e.getCurrentPageShapes().filter((s) => s.type === "arrow")) {
      const bindings = e.getBindingsFromShape(a, "arrow");
      if (bindings.length !== 2) bindingFailures++;
      const points = e.getShapeGeometry(a).children[0].vertices.map((p) => e.getShapePageTransform(a).applyToPoint(p));
      // The demo uses horizontal straight paths: their interval/bounds check is exact.
      for (let i = 0; i < nodes.length; i++) {
        if (bindings.some((b) => b.toId === nodes[i].id)) continue;
        const b = boxes[i];
        const left = Math.min(...points.map((p) => p.x)),
          right = Math.max(...points.map((p) => p.x));
        if (points[0].y > b.minY && points[0].y < b.maxY && left < b.maxX && right > b.minX) nodeEdgeIntersections++;
      }
    }
    const gaps = boxes.slice(1).map((b, i) => b.minX - boxes[i].maxX);
    return { diagramType: "data-flow", checks: { nodeOverlap, nodeEdgeIntersections, bindingFailures, spacingFailures: gaps.filter((g) => g < 32).length }, gaps };
  });
  assert.deepEqual(Object.values(layout.checks), [0, 0, 0, 0]);
  await writeFile(`${out}/layout-report.json`, JSON.stringify({ ...layout, failures: [], screenshots: { overview: `${out}/desktop.png` } }, null, 2));
  // The demo is read-only test input. All interaction mutations use a new room.
  const fixture = await page.evaluate(() => {
    const e = window.__tldrawEditor;
    return { shapes: e.getCurrentPageShapes(), bindings: [...e.store.allRecords()].filter((r) => r.typeName === "binding") };
  });
  await page.goto(`${base}/d/td_live_test_${Date.now()}`);
  await page.waitForFunction(() => !!window.__tldrawEditor);
  await page.evaluate(({ shapes, bindings }) => {
    const e = window.__tldrawEditor;
    e.createShapes(shapes.map((s) => ({ ...s, parentId: e.getCurrentPageId() })));
    e.createBindings(bindings);
    e.zoomToFit();
  }, fixture);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Live diagram · Play", exact: true }).click();
  await page.waitForSelector("[data-live-pulse]");
  assert.equal(await page.locator("[data-live-pulse]").count(), 3);
  const before = await page.evaluate(() => JSON.stringify(window.__tldrawEditor.store.serialize("document")));
  const moving = await page
    .locator("[data-live-pulse]")
    .first()
    .evaluate(async (el) => {
      const a = el.getBoundingClientRect();
      await new Promise((r) => setTimeout(r, 500));
      const b = el.getBoundingClientRect();
      return Math.hypot(a.x - b.x, a.y - b.y) > 2;
    });
  assert.ok(moving, "SVG marker moves");
  assert.equal(await page.evaluate(() => JSON.stringify(window.__tldrawEditor.store.serialize("document"))), before, "animation does not write records");
  // Binding-driven geometry, curved body and head direction stay live.
  const motionPath = page.locator('[data-shape-id="shape:live-demo-flow-0"] animateMotion');
  const firstPath = await motionPath.getAttribute("path");
  await page.evaluate(() => {
    const e = window.__tldrawEditor;
    e.markHistoryStoppingPoint("live path test");
    e.updateShape({ id: "shape:live-demo-agent", type: "live-frame", y: 180, rotation: 0.2 });
    e.updateShape({ id: "shape:live-demo-flow-0", type: "arrow", props: { bend: 35, arrowheadStart: "arrow", arrowheadEnd: "none" } });
  });
  await page.waitForFunction((old) => document.querySelector('[data-shape-id="shape:live-demo-flow-0"] animateMotion')?.getAttribute("path") !== old, firstPath);
  assert.match(await motionPath.getAttribute("path"), / A/);
  assert.equal(await motionPath.getAttribute("keyPoints"), "1;0");
  const transformed = await page.evaluate(() => {
    const e = window.__tldrawEditor;
    const camera = e.getCamera();
    e.setCamera({ x: camera.x + 45, y: camera.y + 35, z: camera.z * 0.85 });
    const pulse = document.querySelector("[data-live-pulse]");
    return !!pulse.getScreenCTM() && pulse.getScreenCTM().a !== 0;
  });
  assert.ok(transformed, "pulse inherits camera transform");
  await page.evaluate(() => {
    window.__tldrawEditor.undo();
    window.__tldrawEditor.zoomToFit();
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal(await page.locator("[data-live-pulse]").count(), 0);
  await page.evaluate(() => {
    window.__tldrawEditor.select("shape:live-demo-agent");
  });
  await page.getByText("Styling", { exact: true }).click();
  await page.getByLabel("Frame", { exact: true }).selectOption("plain");
  assert.equal(await page.evaluate(() => window.__tldrawEditor.getShape("shape:live-demo-agent").props.frame), "plain");
  await page.evaluate(() => {
    window.__tldrawEditor.undo();
  });
  assert.equal(await page.evaluate(() => window.__tldrawEditor.getShape("shape:live-demo-agent").props.frame), "mat");
  await page.evaluate(() => {
    window.__tldrawEditor.redo();
  });
  assert.equal(await page.evaluate(() => window.__tldrawEditor.getShape("shape:live-demo-agent").props.frame), "plain");
  await page.getByLabel("Frame", { exact: true }).selectOption("mat");
  await page.getByText("Styling", { exact: true }).click();

  const geometry = await page.evaluate(async () => {
    const e = window.__tldrawEditor;
    const id = "shape:live-demo-agent";
    const original = e.getShape(id);
    const arrow = document.querySelector('[data-shape-id="shape:live-demo-flow-0"]');
    e.markHistoryStoppingPoint("geometry test");
    e.resizeShape(id, { x: 1.4, y: 1.3 });
    e.updateShape({ id, type: "live-frame", x: original.x + 30, y: original.y + 100, rotation: 0.25 });
    const grown = e.getShape(id);
    const binds = e.getBindingsToShape(id, "arrow");
    const svg = await e.getSvgString([...e.getCurrentPageShapeIds()]);
    e.undo();
    return {
      grew: grown.props.w > original.props.w,
      fontUnscaled: !("scale" in grown.props),
      bindingCount: binds.length,
      svg: svg.svg,
      restored: e.getShape(id).props.w === original.props.w,
      wrapperExists: !!arrow,
    };
  });
  assert.ok(geometry.grew && geometry.fontUnscaled && geometry.restored);
  assert.equal(geometry.bindingCount, 2);
  assert.match(geometry.svg, /data-live-frame="mat"/);
  assert.match(geometry.svg, /data-live-frame="plain"/);
  assert.match(geometry.svg, /User/);
  assert.doesNotMatch(geometry.svg, /animateMotion/);
  await writeFile(`${out}/static.svg`, geometry.svg);
  const svgPage = await browser.newPage({ viewport: { width: 1440, height: 600 } });
  await svgPage.setContent(geometry.svg);
  await svgPage.screenshot({ path: `${out}/static-export.png` });
  await svgPage.close();
  const png = await page.evaluate(async () => {
    const e = window.__tldrawEditor;
    const result = await e.toImage([...e.getCurrentPageShapeIds()], { format: "png", scale: 1 });
    return [...new Uint8Array(await result.blob.arrayBuffer())];
  });
  assert.deepEqual(png.slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
  await writeFile(`${out}/static.png`, Buffer.from(png));
  // Native selection handles: dragging changes box dimensions, not text size.
  await page.evaluate(() => {
    const e = window.__tldrawEditor;
    e.select("shape:live-demo-service");
  });
  const sizeBefore = await page.evaluate(() => window.__tldrawEditor.getShape("shape:live-demo-service").props.w);
  // 5.2.5 selection handles are canvas overlays, not DOM elements.
  const corner = await page.evaluate(() => {
    const e = window.__tldrawEditor,
      b = e.getShapePageBounds("shape:live-demo-service");
    return e.pageToScreen({ x: b.maxX, y: b.maxY });
  });
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 50, corner.y + 35, { steps: 8 });
  await page.mouse.up();
  assert.ok(await page.evaluate((old) => window.__tldrawEditor.getShape("shape:live-demo-service").props.w > old, sizeBefore));
  await page.evaluate(() => {
    window.__tldrawEditor.undo();
  });

  // Native editable rich text through an actual double-click and typing.
  const center = await page.evaluate(() => {
    const e = window.__tldrawEditor;
    e.selectNone();
    e.zoomToFit();
    return e.pageToScreen(e.getShapePageBounds("shape:live-demo-response").center);
  });
  await page.waitForTimeout(300);
  await page.mouse.dblclick(center.x, center.y);
  const editable = page.locator('[contenteditable="true"]').last();
  await editable.waitFor({ state: "visible" });
  await editable.fill("Response\nEdit check");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  assert.match(await page.evaluate(() => JSON.stringify(window.__tldrawEditor.getShape("shape:live-demo-response").props.richText)), /Edit check/);
  // Save a non-default choice and metadata through the actual sync room.
  await page.evaluate(() => {
    const e = window.__tldrawEditor;
    e.updateShape({ id: "shape:live-demo-response", type: "live-frame", props: { frame: "plain" }, meta: { liveActive: true } });
  });
  await page.waitForTimeout(1000);
  await page.reload();
  await page.waitForFunction(() => window.__tldrawEditor?.getShape("shape:live-demo-response"));
  assert.match(await page.evaluate(() => JSON.stringify(window.__tldrawEditor.getShape("shape:live-demo-response").props.richText)), /Edit check/);
  assert.equal(await page.locator("[data-live-pulse]").count(), 0, "reload does not autoplay");
  const saved = await page.evaluate(() => window.__tldrawEditor.getShape("shape:live-demo-response"));
  assert.equal(saved.props.frame, "plain");
  assert.equal(saved.meta.liveActive, true);
  const roundtrip = await page.evaluate(() => {
    const e = window.__tldrawEditor,
      id = "shape:live-demo-response";
    const snapshot = JSON.parse(JSON.stringify(e.store.getStoreSnapshot()));
    e.updateShape({ id, type: "live-frame", props: { frame: "mat" } });
    e.store.loadStoreSnapshot(snapshot);
    return e.getShape(id).props.frame === "plain" && e.getShape(id).meta.liveActive === true;
  });
  assert.ok(roundtrip, "JSON snapshot roundtrip retains custom props and metadata");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.getByRole("button", { name: "No motion", exact: true }).isDisabled(), true);
  await page.screenshot({ path: `${out}/reduced-motion.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.__tldrawEditor.zoomToFit();
  });
  await page.getByText("Styling", { exact: true }).click();
  await page.screenshot({ path: `${out}/mobile.png` });
  const panel = await page.locator(".live-options").boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 390, "mobile controls fit viewport");
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        status: "passed",
        checks: [
          "render",
          "SVG motion",
          "no frame writes",
          "pause",
          "style undo redo",
          "Editor resize move rotate",
          "native resize handle",
          "bindings",
          "curved/reverse paths",
          "zoom/pan transform",
          "static SVG and PNG",
          "native text editing",
          "reload persistence",
          "snapshot JSON roundtrip",
          "reduced motion",
          "mobile panel bounds",
          "numeric demo layout",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Live diagram verification passed");
} finally {
  await browser.close();
}
