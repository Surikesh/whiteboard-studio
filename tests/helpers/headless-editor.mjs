// Headless tldraw Editor for node:test. tldraw expects a DOM container; this gives it an inert stand-in,
// enough for store, shape and binding operations (no rendering, no layout measurement).
import "./browser-globals.mjs";
import { Editor, createTLStore, defaultAddFontsFromNode, defaultBindingUtils, defaultTools, tipTapDefaultExtensions } from "tldraw";

function fakeStyle() {
  const values = new Map();
  return { setProperty: (key, value) => values.set(key, value), getPropertyValue: (key) => values.get(key) ?? "", removeProperty: (key) => values.delete(key) };
}

function fakeElement() {
  const element = {
    style: fakeStyle(),
    children: [],
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {},
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    appendChild(child) {
      return child;
    },
    removeChild() {},
    remove() {},
    focus() {},
    blur() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 }),
    scrollWidth: 0,
    scrollHeight: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    textContent: "",
    innerHTML: "",
  };
  element.ownerDocument = {
    createElement: fakeElement,
    body: element,
    documentElement: element,
    addEventListener() {},
    removeEventListener() {},
    activeElement: null,
    hasFocus: () => false,
    fonts: { ready: Promise.resolve(), forEach() {} },
    defaultView: globalThis,
  };
  element.getRootNode = () => element.ownerDocument;
  return element;
}

// Minimal tree with HTML serialization: tiptap and prosemirror build rich text through it (label measurement).
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
class MiniNode {
  constructor(tag, text = "") {
    this.tag = tag;
    this.text = text;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.nodeType = tag === "#text" ? 3 : tag === "#fragment" ? 11 : 1;
  }
  appendChild(child) {
    if (child.tag === "#fragment") this.children.push(...child.children);
    else this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  get innerHTML() {
    return this.children.map((child) => child.outerHTML).join("");
  }
  get outerHTML() {
    if (this.tag === "#text") return escapeHtml(this.text);
    if (this.tag === "#fragment") return this.innerHTML;
    const attributes = Object.entries(this.attributes)
      .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
      .join("");
    return ["br", "hr", "img"].includes(this.tag) ? `<${this.tag}${attributes}>` : `<${this.tag}${attributes}>${this.innerHTML}</${this.tag}>`;
  }
}
const miniDocument = {
  createElement: (tag) => new MiniNode(tag),
  createTextNode: (text) => new MiniNode("#text", text),
  createDocumentFragment: () => new MiniNode("#fragment"),
  implementation: { createHTMLDocument: () => miniDocument },
};

export function installBrowserGlobals() {
  globalThis.window ??= globalThis;
  globalThis.devicePixelRatio ??= 1;
  // Frames never fire: tldraw's tick loop would otherwise keep the test process alive forever.
  globalThis.requestAnimationFrame ??= () => 0;
  globalThis.cancelAnimationFrame ??= () => {};
  globalThis.document ??= miniDocument;
}

export function createHeadlessEditor(shapeUtils) {
  installBrowserGlobals();
  const store = createTLStore({ shapeUtils, bindingUtils: defaultBindingUtils });
  return new Editor({
    store,
    shapeUtils,
    bindingUtils: defaultBindingUtils,
    tools: defaultTools,
    initialState: "select",
    getContainer: fakeElement,
    textOptions: { addFontsFromNode: defaultAddFontsFromNode, tipTapConfig: { extensions: tipTapDefaultExtensions } },
  });
}

export async function createLabEditor() {
  const { loadAppModule } = await import("./load-app.mjs");
  // Spec/IO/patch helpers are imported from their own modules; only the shape registry comes from the composition root.
  const parts = await Promise.all(
    [
      "app/tldraw-lab.tsx",
      "app/io/component-store.ts",
      "app/io/workspace-storage.ts",
      "app/io/csv.ts",
      "app/domain/spec/types.ts",
      "app/domain/spec/load-graph.ts",
      "app/domain/templates/service.ts",
      "app/state/use-agent-patch.ts",
    ].map((file) => loadAppModule(file)),
  );
  const app = Object.assign({}, ...parts);
  return { app, editor: createHeadlessEditor(app.collaborativeShapeUtils), newEditor: () => createHeadlessEditor(app.collaborativeShapeUtils) };
}

export const shapesOfType = (editor, type) => editor.getCurrentPageShapes().filter((shape) => shape.type === type);
export const bindingsFrom = (editor, shapes) => shapes.flatMap((shape) => editor.getBindingsFromShape(shape, "arrow"));
