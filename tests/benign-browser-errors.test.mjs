import assert from "node:assert/strict";
import test from "node:test";
import { loadAppModule } from "./helpers/load-app.mjs";

const { BENIGN_ERROR_FILTER_SCRIPT } = await loadAppModule("app/state/benign-browser-errors.ts");

function errorEvent(message, error) {
  const event = new Event("error", { cancelable: true });
  Object.assign(event, { message, error });
  return event;
}

// Runs the exact inline script against a fake window, then registers a reporter after it (as the vinext overlay does).
function stand() {
  const window = new EventTarget();
  new Function("window", BENIGN_ERROR_FILTER_SCRIPT)(window);
  const reported = [];
  window.addEventListener("error", (event) => reported.push(event.message));
  return { window, reported };
}

test("the two browser ResizeObserver notifications never reach later reporters", () => {
  const { window, reported } = stand();
  window.dispatchEvent(errorEvent("ResizeObserver loop completed with undelivered notifications."));
  window.dispatchEvent(errorEvent("ResizeObserver loop limit exceeded"));
  assert.deepEqual(reported, []);
});

test("real errors, lookalikes and errors with an error object propagate", () => {
  const { window, reported } = stand();
  window.dispatchEvent(errorEvent("ResizeObserver loop completed with undelivered notifications.", new Error("real")));
  window.dispatchEvent(errorEvent("TypeError: x is not a function"));
  window.dispatchEvent(errorEvent("Uncaught ResizeObserver is not defined"));
  window.dispatchEvent(errorEvent(undefined));
  assert.equal(reported.length, 4);
});

test("the root layout ships the filter in <head>", async () => {
  const { readFile } = await import("node:fs/promises");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<head>\s*<script dangerouslySetInnerHTML=\{\{ __html: BENIGN_ERROR_FILTER_SCRIPT \}\} \/>\s*<\/head>/);
});
