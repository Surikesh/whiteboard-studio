// "ResizeObserver loop completed with undelivered notifications" is a browser notification, not an application error:
// tldraw's overflowing toolbar re-measures inside a ResizeObserver callback while the window is resized, and the browser
// reports that it delivered the follow-up observation in the next frame. It has no error object and no stack, and nothing
// is lost. Error reporters (the vinext dev error overlay) treat every window "error" event as a crash, so the overlay
// covered the canvas and blocked pointer events.
//
// The filter must be the FIRST "error" listener on window: listeners on the same target run in registration order and the
// overlay registers itself while hydrating. It therefore ships as an inline <head> script (see layout.tsx), written as a
// string so the exact code that runs in the browser is the code the tests execute. It drops only these two exact browser
// messages; every other error still propagates unchanged.
//
// Grounding (versions as installed):
// - Browser semantics: the CSS Resize Observer spec queues a window "error" ErrorEvent with exactly this message
//   (no error object) when observations are left for the next frame: https://drafts.csswg.org/resize-observer/#deliver-resize-error
//   and MDN, "Observation errors": https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver#observation_errors .
//   Chrome's older wording "ResizeObserver loop limit exceeded" is the same condition, hence the second message.
// - Observer that triggers it: tldraw 5.2.5, node_modules/tldraw/src/lib/ui/components/Toolbar/OverflowingToolbar.tsx:255
//   (`new ResizeObserver(onDomUpdate)` on the sizing parent; the file's own comment at :246 mentions these loop warnings).
// - Listener order: vinext 0.0.50 registers its overlay listener in node_modules/vinext/dist/server/dev-error-overlay.js:20
//   (`window.addEventListener("error", ...)` inside installDevErrorOverlay), called at
//   node_modules/vinext/dist/server/app-browser-entry.js:418 during hydration. Listeners on one target run in registration
//   order (https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke), so a script that runs earlier wins.
export const BENIGN_ERROR_PATTERN = "^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)\\.?$";

export const BENIGN_ERROR_FILTER_SCRIPT = `(function(){var p=new RegExp(${JSON.stringify(BENIGN_ERROR_PATTERN)});window.addEventListener("error",function(e){if(!e.error&&typeof e.message==="string"&&p.test(e.message)){e.stopImmediatePropagation();e.preventDefault();}},true);})();`;
