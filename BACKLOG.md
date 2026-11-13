# Backlog

## Web frames on the canvas

**Goal.** Put live web pages on the board as resizable frames ("site tiles"), so a page
running locally (e.g. `http://localhost:3000`) or any external URL can be viewed next to
the diagram.

**Scope.**

1. **Frame from URL.** Pasting a URL (or adding it through a toolbar action) creates a
   frame shape that renders the page in an `<iframe>`. Must work for `localhost` /
   `127.0.0.1` / LAN addresses, not only the tldraw embed allowlist (YouTube, Figma, …);
   this likely needs a custom shape rather than the built-in `EmbedShapeUtil`.
2. **Frame from HTML.** Pasting raw HTML (or dropping an `.html` file) creates the same
   frame rendered through `srcdoc` in a sandboxed iframe.
3. **Frame controls.** Resize, reload, open in a new tab, edit the URL, and an
   interact/select toggle so clicks go either to the page or to the canvas.
4. **History.** Keep a list of previously opened URLs / HTML snippets (title, URL or
   snippet, timestamp, last-used workspace) with quick re-open onto the canvas, and
   remove/clear entries. Each frame also keeps the history of its own URL changes.

**Constraints.**

- Frames stay normal editable Tldraw shapes with stable IDs; the shape stores only the
  URL or HTML, never page content.
- Pasted HTML runs in a sandboxed iframe (no `allow-same-origin` together with
  `allow-scripts`); it must not reach the lab's origin, storage, or local agent APIs.
- Shared tunnel: `localhost` frames resolve on each viewer's own machine, so remote
  viewers will not see the host's local apps. Do not proxy local ports through the
  tunnel by default; show a clear placeholder instead. History stays local and is not
  synced to the room unless explicitly enabled.
- Sites that forbid embedding (`X-Frame-Options` / CSP `frame-ancestors`) show a
  fallback card with an "open in new tab" link instead of a blank frame.

**Done when.** A URL to a local dev server, an external URL, and a pasted HTML snippet
each appear as working frames; history lists them and re-opens them after reload;
`npm run build` passes.
