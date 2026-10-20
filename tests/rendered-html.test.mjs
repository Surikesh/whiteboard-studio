import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readLabSource } from "./helpers/lab-source.mjs";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Tldraw loading shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Whiteboard Studio<\/title>/i);
  assert.match(html, /WHITEBOARD STUDIO/);
  assert.match(html, /Preparing the canvas/);
});

test("ships agent diagram support", async () => {
  const [source, schema, example, css, layoutHarness, layoutProtocol] = await Promise.all([
    readLabSource(),
    readFile(new URL("../DIAGRAM_SPEC.md", import.meta.url), "utf8"),
    readFile(new URL("../public/diagrams/example.diagram.json", import.meta.url), "utf8"),
    Promise.all(["base", "shell", "cards", "assets", "responsive"].map((name) => readFile(new URL(`../app/styles/${name}.css`, import.meta.url), "utf8"))).then((parts) => parts.join("\n")),
    readFile(new URL("../scripts/workspace-layout.mjs", import.meta.url), "utf8"),
    readFile(new URL("../WORKSPACE_LAYOUT_PREFLIGHT.md", import.meta.url), "utf8"),
  ]);
  assert.match(source, /whiteboard-studio\/v1/);
  assert.match(source, /URLSearchParams/);
  assert.match(schema, /scripts\/diagram\.mjs/);
  assert.equal(JSON.parse(example).format, "whiteboard-studio/v1");
  const headerRule = css.match(/\.lab-header\s*\{([^}]*)\}/)?.[1] ?? "";
  const hintRule = css.match(/\.lab-hint\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(headerRule, /display:\s*none/);
  assert.doesNotMatch(headerRule, /display:\s*grid/);
  assert.match(hintRule, /display:\s*none/);
  assert.doesNotMatch(hintRule, /display:\s*flex/);
  assert.match(layoutHarness, /editor\.alignShapes/);
  assert.match(layoutHarness, /editor\.stackShapes/);
  assert.match(layoutHarness, /minimumGap/);
  assert.match(layoutHarness, /zoomToSelection/);
  assert.match(layoutProtocol, /realtime `Editor`/);
});

test("templates have no locked, decorative, or patterned backgrounds", async () => {
  const source = await readLabSource();
  assert.doesNotMatch(source, /background:\s*id\("background"\)/);
  assert.doesNotMatch(source, /isLocked:\s*true/);
  // Tldraw's semi fill is a repeating pattern. On some browser/GPU combinations
  // it escapes clipping and looks like full-height dotted background guides.
  assert.doesNotMatch(source, /fill:\s*["']semi["']/);
  assert.match(source, /clearTransientCanvasOverlays/);
  assert.match(source, /editor\.snaps\.clearIndicators\(\)/);
  assert.match(source, /updateInstanceState\(\{ isGridMode: false \}\)/);
  assert.match(source, /useSync\(\{/);
  assert.match(source, /\/api\/connect\//);
  assert.match(source, /store=\{collaborativeStore\}/);
  assert.match(source, /Cmd|metaKey/);
  assert.match(source, /workspace-drawer/);
  // Passing createDocument directly to onClick forwards React's MouseEvent as
  // the snapshot argument, which then fails when persisted with JSON.stringify.
  assert.doesNotMatch(source, /onClick=\{workspace\.createDocument\}/);
  assert.match(source, /onClick=\{\(\) => workspace\.createDocument\(\)\}/);
  assert.match(source, /DefaultMainMenuContent/);
  assert.match(source, /TldrawUiMenuActionItem/);
  assert.match(source, /actions:\s*\(/);
  assert.match(source, /overrides=\{uiOverrides\}/);
  assert.match(source, /Save a copy/);
  assert.match(source, /serializeTldrawJsonBlob/);
  assert.match(source, /editor\.toImage/);
  assert.match(source, /sourceUpdatedAt/);
  assert.match(source, /__tldrawEditor = editor/);
  assert.match(source, /if \(!label\.trim\(\)\) return \[\]/);
  assert.match(source, /diagramSpecMinimumHeight: size\.h/);
  assert.doesNotMatch(source, /current\?\.sourceUrl, current\?\.updatedAt/);
  assert.doesNotMatch(source, /floating-topbar|workspace-trigger|current-document|floating-actions/);
});
