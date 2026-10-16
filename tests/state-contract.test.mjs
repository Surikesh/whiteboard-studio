import "./helpers/browser-globals.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { loadAppModule } from "./helpers/load-app.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(path.join(root, name), "utf8");
const hooks = ["use-workspace", "use-editor-session", "use-document-io", "use-agent-patch"];
const modules = [...hooks, "save-status", "menu-actions"];
const requireModule = async (name) => {
  assert.ok(existsSync(path.join(root, `app/state/${name}.ts`)), `state module missing: app/state/${name}.ts`);
  return loadAppModule(`app/state/${name}.ts`);
};
const stateFiles = (dir) =>
  readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? stateFiles(`${dir}/${entry.name}`) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : [],
  );
function relativeImports(file) {
  const imports = [],
    ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression))
      imports.push(node.moduleReference.expression.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    )
      imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return imports.filter((id) => id.startsWith("."));
}
function resolveRelative(file, id) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), id));
  const stem = base.replace(/\.[cm]?[jt]sx?$/, "");
  return (
    [base, ...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.mts", "/index.cts", "/index.js", "/index.jsx"].map((ext) => stem + ext)].find(
      (candidate) => existsSync(path.join(root, candidate)) && /\.[cm]?[jt]sx?$/.test(candidate),
    ) ?? base
  );
}

test("state structure: callable composed hooks; ALL state files small, no root/UI imports or cycles", async () => {
  const app = read("app/tldraw-lab.tsx");
  for (const name of modules) {
    const exports = await requireModule(name);
    if (hooks.includes(name)) {
      const hook = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      assert.equal(typeof exports[hook], "function");
      assert.match(app, new RegExp(`\\b${hook}\\s*\\(`));
    }
  }
  const files = [...stateFiles("app/state"), "app/tldraw-lab.tsx"],
    edges = new Map();
  for (const file of files) {
    const targets = relativeImports(file).map((id) => resolveRelative(file, id));
    if (file.startsWith("app/state/")) {
      assert.ok(read(file).trimEnd().split("\n").length <= 400, `${file} exceeds 400 lines`);
      for (const target of targets) assert.ok(target !== "app/tldraw-lab.tsx" && target !== "app/ui" && !target.startsWith("app/ui/"), `${file} imports ${target}`);
    }
    edges.set(
      file,
      targets.filter((target) => files.includes(target)),
    );
  }
  const done = new Set();
  function visit(file, stack = []) {
    assert.ok(!stack.includes(file), `state/root cycle: ${[...stack, file].join(" -> ")}`);
    if (done.has(file)) return;
    for (const next of edges.get(file) ?? []) visit(next, [...stack, file]);
    done.add(file);
  }
  for (const file of files) visit(file);
});

const failure = new Error("bounded failure");
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function operations(owner, factory, options, events) {
  const exports = await requireModule(owner);
  const { createStatusRecovery } = await requireModule("save-status");
  const setSaved = (value) => events.push(value);
  const result = exports[factory]({ ...options, status: { setSaved, recovery: createStatusRecovery(setSaved) } });
  // These are the helpers the production hook must instantiate and invoke, not test-only recovery wrappers.
  const source = read(`app/state/${owner}.ts`);
  const declaration = new RegExp(`function\\s+${factory}\\s*\\(`, "g");
  assert.ok((source.replace(declaration, "").match(new RegExp(`\\b${factory}\\s*\\(`, "g")) ?? []).length >= 1, `${factory} must be called by its owning hook`);
  const methods = {
    "use-workspace": ["pollWorkspace", "loadThumbnails", "createDocument"],
    "use-document-io": ["refreshServerRevisions", "readLocalRevisions", "consumePending"],
    "use-editor-session": ["startInitialFit", "onUserChange"],
  };
  for (const method of methods[owner]) assert.match(source, new RegExp(`\\.${method}\\s*\\(`), `hook must invoke ${method} through its operations object`);
  return result;
}
const errorStatus = (site) => `Error: ${site}: Error: bounded failure`;
function workspaceOptions(events) {
  const state = { documents: [], thumbnails: { retained: "old" }, cancelled: false };
  const created = { id: "new", title: "New", updatedAt: "1" };
  return {
    state,
    created,
    options: {
      currentId: "requested",
      remoteUpdatedAt: new Map([["kept", "1"]]),
      reconcileComplete: { current: true },
      readDocuments: () => [{ id: "local", title: "Local", updatedAt: "1" }],
      getDocuments: () => state.documents,
      setDocuments: (update) => {
        state.documents = typeof update === "function" ? update(state.documents) : update;
      },
      writeDocuments: () => events.push("persist"),
      newDocument: () => created,
      retrieveSources: async () => {
        throw failure;
      },
      readThumbnails: async () => {
        throw failure;
      },
      setThumbnails: (value) => {
        state.thumbnails = value;
      },
      isCancelled: () => state.cancelled,
      pushDocument: async () => {
        events.push("push");
        throw failure;
      },
      navigate: (id) => events.push(`navigate:${id}`),
    },
  };
}

test("workspace-poll: undefined fallback, incomplete flag, retained map, local/synthetic recovery", async () => {
  const events = [],
    h = workspaceOptions(events);
  let reject = true;
  h.options.retrieveSources = async () => {
    if (reject) throw failure;
    return { agentResult: [], sharedResult: [{ id: "remote", title: "Remote", updatedAt: "2" }], complete: true };
  };
  const ops = await operations("use-workspace", "createWorkspaceOperations", h.options, events);
  assert.equal(await ops.pollWorkspace(), undefined);
  assert.equal(h.options.reconcileComplete.current, false);
  assert.deepEqual([...h.options.remoteUpdatedAt], [["kept", "1"]]);
  assert.deepEqual(
    h.state.documents.map((doc) => doc.id),
    ["requested", "local"],
  );
  assert.deepEqual(events, ["persist", errorStatus("workspace-poll")]);
  events.length = 0;
  await ops.pollWorkspace();
  assert.deepEqual(events, [errorStatus("workspace-poll")], "existing requested board not synthesized twice");
  reject = false;
  events.length = 0;
  assert.equal(await ops.pollWorkspace(), undefined);
  assert.equal(h.options.reconcileComplete.current, true);
  assert.deepEqual([...h.options.remoteUpdatedAt], [["remote", "2"]]);
  assert.ok(h.state.documents.some((doc) => doc.id === "remote"));
  assert.deepEqual(events, ["persist"]);
});

test("thumbnail-read: rejection keeps prior values; success obeys cancellation", async () => {
  const events = [],
    h = workspaceOptions(events);
  let reject = true;
  h.options.readThumbnails = async () => {
    if (reject) throw failure;
    return { fresh: "src" };
  };
  const ops = await operations("use-workspace", "createWorkspaceOperations", h.options, events);
  assert.equal(await ops.loadThumbnails(), undefined);
  assert.deepEqual(h.state.thumbnails, { retained: "old" });
  assert.deepEqual(events, [errorStatus("thumbnail-read")]);
  reject = false;
  h.state.cancelled = true;
  await ops.loadThumbnails();
  assert.deepEqual(h.state.thumbnails, { retained: "old" });
  h.state.cancelled = false;
  await ops.loadThumbnails();
  assert.deepEqual(h.state.thumbnails, { fresh: "src" });
  assert.equal(events.length, 1);
});

test("document-create: prepare/persist/send -> error status -> finally navigate; success also navigates", async () => {
  const events = [],
    h = workspaceOptions(events);
  let reject = true;
  h.options.pushDocument = async () => {
    events.push("push");
    if (reject) throw failure;
  };
  const ops = await operations("use-workspace", "createWorkspaceOperations", h.options, events);
  const prepare = (doc) => {
    assert.equal(doc, h.created);
    events.push("prepare");
  };
  assert.equal(await ops.createDocument("New", prepare), undefined);
  assert.equal(h.state.documents[0], h.created);
  assert.deepEqual(events, ["prepare", "persist", "push", errorStatus("document-create"), "navigate:new"]);
  reject = false;
  events.length = 0;
  await ops.createDocument("New", prepare);
  assert.deepEqual(events, ["prepare", "persist", "push", "navigate:new"]);
});

test("revision-list: failed GET returns [] AND clears displayed history; success/non-OK parity", async () => {
  const events = [],
    state = { history: [{ file: "old" }] };
  let mode = "reject";
  const list = [{ file: "new", at: "now" }];
  const ops = await operations(
    "use-document-io",
    "createDocumentIoOperations",
    {
      currentId: "board",
      fetch: async (url, init) => {
        assert.equal(url, "/api/lab/revisions?id=board");
        assert.equal(init.cache, "no-store");
        if (mode === "reject") throw failure;
        return { ok: mode === "ok", json: async () => list };
      },
      setServerRevisions: (value) => {
        state.history = value;
        events.push("history");
      },
    },
    events,
  );
  assert.deepEqual(await ops.refreshServerRevisions(), []);
  assert.deepEqual(state.history, []);
  assert.deepEqual(events, ["history", errorStatus("revision-list")]);
  mode = "ok";
  assert.deepEqual(await ops.refreshServerRevisions(), list);
  assert.equal(state.history, list);
  mode = "non-ok";
  assert.deepEqual(await ops.refreshServerRevisions(), []);
  assert.deepEqual(state.history, []);
  assert.equal(events.filter((event) => event.startsWith("Error:")).length, 1);
});

test("revision-local-read: synchronous [] fallback; only publishing effect reports error", async () => {
  const events = [];
  let broken = true;
  const ops = await operations(
    "use-document-io",
    "createDocumentIoOperations",
    {
      currentId: "board",
      revisionKey: (id) => `revisions:${id}`,
      storage: {
        getItem: (key) => {
          assert.equal(key, "revisions:board");
          if (broken) throw failure;
          return '[{"at":"now"}]';
        },
      },
    },
    events,
  );
  const result = ops.readLocalRevisions();
  assert.deepEqual(result, { revisions: [], error: errorStatus("revision-local-read") });
  assert.deepEqual(events, [], "render read must not set React status");
  ops.publishLocalRevisionError(result.error);
  assert.deepEqual(events, [errorStatus("revision-local-read")]);
  broken = false;
  assert.deepEqual(ops.readLocalRevisions(), { revisions: [{ at: "now" }], error: "" });
  ops.publishLocalRevisionError("");
  assert.equal(events.length, 1);
  assert.match(
    read("app/state/use-document-io.ts"),
    /useEffect\(\(\)\s*=>\s*\{?\s*(?:\w+\.)?publishLocalRevisionError\(localRevisionRead\.error\);?(?:\s*\/\/[^\n]*)?\s*\}?\s*,\s*\[localRevisionRead\.error\]\s*\)/,
    "hook publishes derived error only in keyed effect",
  );
});

test("pending-import-read: failed persisted read -> status -> removal -> memory fallback/clear", async () => {
  const events = [];
  let mode = "throw";
  const refs = Object.fromEntries(["snapshot", "spec", "title"].map((key) => [key, { current: `memory:${key}` }]));
  const ops = await operations(
    "use-document-io",
    "createDocumentIoOperations",
    {
      pendingKey: (id) => `pending:${id}`,
      pendingSnapshot: refs.snapshot,
      pendingSpec: refs.spec,
      pendingTitle: refs.title,
      storage: {
        getItem: () => {
          events.push("read");
          if (mode === "throw") throw failure;
          return mode === "bad-json" ? "{" : '{"snapshot":"disk","title":"Disk"}';
        },
        removeItem: (key) => {
          events.push(`remove:${key}`);
          assert.equal(refs.snapshot.current, "memory:snapshot", "removal precedes consuming/clearing refs");
          if (mode === "remove-throw") throw failure;
        },
      },
    },
    events,
  );
  assert.deepEqual(ops.consumePending("board"), { snapshot: "memory:snapshot", spec: "memory:spec", title: "memory:title" });
  assert.deepEqual(events, ["read", errorStatus("pending-import-read"), "remove:pending:board"]);
  assert.deepEqual(
    Object.values(refs).map((ref) => ref.current),
    [null, null, ""],
  );
  const reset = () => {
    for (const key of Object.keys(refs)) refs[key].current = `memory:${key}`;
    events.length = 0;
  };
  reset();
  mode = "ok";
  assert.deepEqual(ops.consumePending("board"), { snapshot: "disk", spec: "memory:spec", title: "Disk" });
  assert.deepEqual(events, ["read", "remove:pending:board"]);
  reset();
  mode = "bad-json";
  assert.equal(ops.consumePending("board").snapshot, "memory:snapshot");
  assert.match(events[1], /^Error: pending-import-read: SyntaxError:/);
  reset();
  mode = "remove-throw";
  assert.throws(() => ops.consumePending("board"), /bounded failure/);
  assert.deepEqual(events, ["read", "remove:pending:board"], "remove failure still propagates, not swallowed/reported");
});

for (const site of ["thumbnail-initial-fit", "thumbnail-user-change"]) {
  test(`${site}: real fit/debounce boundary reports capture failure; success updates thumbnail`, async () => {
    const events = [],
      timers = new Map();
    let timerId = 0,
      reject = true;
    const editor = { getCurrentPageShapes: () => [{}], zoomToFit: () => events.push("fit") };
    const ops = await operations(
      "use-editor-session",
      "createEditorSessionOperations",
      {
        editor,
        currentId: "board",
        thumbnailTimer: { current: undefined },
        revisionTimer: { current: undefined },
        setTimeout: (callback, delay) => {
          timers.set(++timerId, { callback, delay });
          return timerId;
        },
        clearTimeout: (id) => timers.delete(id),
        resizeGeneratedTextBoxes: () => events.push("resize"),
        clearTransientCanvasOverlays: () => events.push("clear"),
        touchDocument: () => events.push("touch"),
        captureDocumentThumbnail: async (actual, id) => {
          assert.equal(actual, editor);
          assert.equal(id, "board");
          events.push("capture");
          if (reject) throw failure;
          return "src";
        },
        setThumbnail: (id, src) => events.push(`thumbnail:${id}:${src}`),
      },
      events,
    );
    const invoke = () => (site === "thumbnail-initial-fit" ? ops.startInitialFit() : ops.onUserChange());
    const fire = async (delay) => {
      const entry = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `scheduled ${delay}ms`);
      timers.delete(entry[0]);
      entry[1].callback();
      await flush();
    };
    invoke();
    if (site === "thumbnail-user-change") {
      const old = [...timers.keys()];
      invoke();
      assert.ok(
        old.every((id) => !timers.has(id)),
        "second user event debounces both timers",
      );
      assert.deepEqual([...timers.values()].map((timer) => timer.delay).sort(), [1200, 900]);
    }
    await fire(site === "thumbnail-initial-fit" ? 100 : 1200);
    assert.deepEqual(events, site === "thumbnail-initial-fit" ? ["resize", "fit", "clear", "capture", errorStatus(site)] : ["Saving…", "Saving…", "capture", errorStatus(site)]);
    reject = false;
    events.length = 0;
    invoke();
    await fire(site === "thumbnail-initial-fit" ? 100 : 1200);
    assert.ok(events.includes("thumbnail:board:src"));
    assert.ok(!events.some((event) => event.startsWith("Error:")));
    const source = read("app/state/use-editor-session.ts");
    assert.match(source, /\.startInitialFit\(\)/);
    assert.match(source, /\.listen\([\s\S]*?\.onUserChange\([\s\S]*?scope:\s*["']document["'][\s\S]*?source:\s*["']user["']/, "real user-only listener calls factory operation");
  });
}

test("menu: consumer factory handles all actions; real stable UI consumers dereference fresh registry", async () => {
  const { createMenuActions } = await requireModule("menu-actions");
  const keys = [
    "openWorkspace",
    "createDocument",
    "renameCurrent",
    "duplicateCurrent",
    "importDocument",
    "exportTldr",
    "exportSnapshot",
    "copyLink",
    "copyId",
    "focus",
    "serviceTemplate",
    "spreadsheet",
    "spreadsheetImport",
  ];
  const log = [],
    input = (generation) => Object.fromEntries([...keys.map((key) => [key, () => log.push(`${generation}:${key}`)]), ["exportImage", (format) => log.push(`${generation}:${format}`)]]);
  const ref = { current: createMenuActions(input("old")) };
  const stable = () => {
    for (const key of [...keys, "exportPng", "exportSvg"]) ref.current[key]();
  };
  assert.deepEqual(Object.keys(ref.current).sort(), [...keys, "exportPng", "exportSvg"].sort());
  stable();
  ref.current = createMenuActions(input("new"));
  stable();
  assert.deepEqual(
    log,
    ["old", "new"].flatMap((generation) => [...keys, "png", "svg"].map((key) => `${generation}:${key}`)),
  );
  const app = `${read("app/tldraw-lab.tsx")}\n${read("app/ui/main-menu.tsx")}`;
  assert.equal((app.match(/createMenuActions\s*\(/g) ?? []).length, 1);
  assert.doesNotMatch(app, /menuActionsRef(?:\.current\s*=|\s*=\s*useRef\()\s*\{/);
  assert.match(app, /useEffect\(\(\)\s*=>\s*\{\s*menuActionsRef\.current\s*=\s*menuActions\s*;?\s*\}\s*\)/);
  for (const key of [...keys, "exportPng", "exportSvg"]) {
    assert.match(app, new RegExp(`(?:onSelect=\\{\\(\\)\\s*=>|onSelect:\\s*\\(\\)\\s*=>)\\s*menuActionsRef\\.current\\.${key}\\(\\)`), `${key} real consumer must read through ref at invocation`);
  }
  assert.doesNotMatch(app, /(?:const|let)\s*\{[^}]*\}\s*=\s*menuActionsRef\.current/, "no captured registry destructuring");
});

test("source seed: cleanup before the timer fires does not consume the attempt; seeds once; non-empty never seeds", async () => {
  const attempted = { current: "" },
    timers = [],
    cleared = [];
  let loads = 0,
    shapes = 0;
  const { scheduleSourceSeed } = await requireModule("use-document-io");
  const run = async () => {
    if (shapes) return;
    loads += 1;
  };
  const start = () =>
    scheduleSourceSeed({
      attempted,
      id: "demo",
      delay: 2000,
      run,
      setTimer: (callback, delay) => {
        assert.equal(delay, 2000);
        timers.push(callback);
        return timers.length - 1;
      },
      clearTimer: (t) => cleared.push(t),
    });
  const cleanup = start();
  cleanup();
  assert.equal(attempted.current, "", "cancelled timer must not mark the attempt");
  const rerun = start();
  assert.ok(rerun, "rerun after cancel must schedule again");
  timers[1]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 1);
  assert.equal(attempted.current, "demo");
  assert.equal(start(), undefined, "no second attempt once it ran");
  assert.equal(timers.length, 2);
  attempted.current = "";
  shapes = 3;
  start();
  timers[2]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 1, "non-empty editor is never seeded");
});
