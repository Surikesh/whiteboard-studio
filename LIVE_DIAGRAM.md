# Experiment: live diagram and frames

## Try it

Run `npm run dev` and open `/d/td_live_diagram_demo_v1` on its local address. A "Live diagram demo" link is available in the library and in the editor's main menu. This is a separate room with a stable ID, not a replacement for the current document. The seed is created only on an empty, not yet initialized demo page; later edits are persisted by the regular realtime model.

1. At the bottom left, click **"Live diagram · Play"**, then **"Pause"**.
2. Select a block → **"Styling" → "Frame"**: plain, passe-partout (mat), or raised frame.
3. Drag the regular selection handles; double-click edits the text.
4. "Add block with frame" creates the same experimental rectangle on any board.
5. "Block highlight" toggles the activity flag on the selected blocks, and "Flow along selected arrows" does the same for selected arrows. Both are saved in the document. Playback is only local tab state and is always off after a reload.

The system setting `prefers-reduced-motion: reduce` disables motion (the "No motion" button). Highlighting stays static. A hidden tab does not play motion. Pause removes the pulses; regular arrows and text remain a finished diagram.

## Verified compatibility: tldraw 5.2.5

The check was done against the installed version (`node_modules/tldraw/package.json`, lockfile), its sources and the bundled API documentation/JSDoc, not against examples for another version:

- `tldraw/src/lib/shapes/geo/GeoShapeUtil.tsx`, `getGeoShapePath.ts`: public `configure`, `getCustomDisplayValues`, `customGeoTypes` exist. The latter extends the outline but does not provide a per-instance multi-layer renderer with different face fills; changing display values does not add layers either. Configuring the standard util affects the registration of `geo` as a whole.
- `@tldraw/editor/src/lib/components/default-components/DefaultShapeWrapper.tsx` and `EditorComponentsContext.tsx`: public `components.ShapeWrapper`, a required ref, and the standard attributes/children. Suitable for a non-persisted animation layer; it does not take part in export on its own.
- `tldraw/src/index.ts`, `lib/shapes/arrow/getArrowInfo.ts`, `ArrowPath.tsx`: `getArrowInfo` is public, the exact body path helper is not. For straight and arc arrows the path is reconstructed from public points and bodyArc parameters that already account for bindings/arrowheads. The hand-drawn stroke is not copied: the marker follows its geometric axis.
- `RichTextLabel.tsx`, `useEditableRichText.ts`: public editable rich text and `RichTextSVG`, which support a custom shape with `props.richText`. `BaseBoxShapeUtil` provides standard resize, and `onBeforeCreate/onBeforeUpdate` constrain sizes to the measured text.

**Decision:** do not replace `GeoShapeUtil` globally, do not change the standard props, and do not decorate the internal DOM. A separate `live-frame` was added via ShapeUtil. "Plain" here is the flat rectangular frame of this experimental type, not a conversion of an existing geo shape. Existing documents and shapes are not changed. The frame intentionally has a fixed calm paper palette and a 20px text size (Arial); the standard geo color/size panel does not apply to it. Rich text, selection, drag, rotation, resize, copying and arrow bindings remain standard.

## Implementation

- `app/live-diagram-schema.ts`: a single props validator for the client and the Durable Object; the new schema is additive.
- `app/live-diagram.tsx`: ShapeUtil, shared SVG frame geometry for canvas/export, the standard RichTextLabel, the animation wrapper, local playback, compact controls and the demo seed.
- `app/live-diagram.css`: CSS pulsing, pointer-events:none for decoration, responsive controls.
- `app/tldraw-lab.tsx`: wiring of the util, wrapper/context, demo links and the small panel.
- `worker/TldrawDurableObject.ts`: registration of the same validator for realtime persistence.

Face thickness and paddings are defined in shape coordinates, without stretching the image. Resize changes w/h but not the font size. The 100×80 minimum and rich text measurement prevent shrinking the frame over its text. Text may increase the required height. Zoom scales the whole shape as usual.

Pulses are SVG `animateMotion`, activity is CSS opacity, with no RAF updates to the Store. The layer lives inside the public wrapper and receives the standard shape/camera transforms, ordering/clipping, plus a reactive `getArrowInfo` for changes to connected shapes. Settings are `props.frame`, `meta.liveFlow`, `meta.liveActive`, with separate undo stopping points and preservation of the other meta.

## Prototype limitations

- Only marked straight/arc `arrow`s with exactly one arrowhead move. A reversed arrowhead flips the direction. Elbow, bidirectional and arrowless arrows stay static: the exact elbow rounding is not exposed by the public body-path API in 5.2.5.
- Pause does not remember the phase; the next play restarts the pulses. This explains a flow; it is not a scheduler for sequential tasks.
- Styling is available only for `live-frame`. There is no automatic conversion of existing geo shapes and no new toolbar tool: add a frame from "Styling".
- SVG/PNG are **static**: frames, rich text and standard arrows. Animation and the wrapper highlight are not exported. `RichTextSVG` in this version uses SVG `foreignObject`: Chrome and PNG via the standard exporter were checked; third-party SVG apps without foreignObject support are not guaranteed.
- An old client without the `live-frame` registration needs updated code to open documents with the new type. Old documents without it need no migration.
- No new dependencies, image generation, external APIs, node_modules patches or changes to the agent access mode.

## Checks and evidence

`npm test` runs the production build and all 10 Node tests, including the new schema roundtrip, rejection of invalid frames/text, and metadata preservation. It passes.

On a running local dev server:

```bash
LIVE_BASE_URL=http://127.0.0.1:5198 npm run test:live
```

A local Chrome is required (the path can be set via `CHROME_PATH`). `scripts/verify-live-diagram.mjs` reads the demo and creates a **new test room** for mutations; it does not overwrite user documents or the demo content. The `td_live_test_*` test rooms are intentionally not deleted automatically.

Actually verified in headless Chrome:

- three moving markers, play/pause, no document record changes while moving;
- curved/reverse paths after moving and rotating connected blocks, inheritance of the zoom/pan transform;
- changing the frame via the UI, undo/redo;
- Editor resize/move/rotate and resize with a real canvas handle by mouse;
- arrow bindings;
- double-click and rich text input through a real contenteditable;
- restoring text, frame and activity after a reload from the sync room;
- JSON Store snapshot roundtrip;
- static SVG/PNG with frames and text, without animateMotion;
- reduced motion, mobile bounds of the styling dropdown;
- actual demo geometry: 0 block overlaps, 0 connections crossing unrelated blocks, 0 binding errors, 90px gaps.

Artifacts: `outputs/live-diagram/{report.json,layout-report.json,desktop.png,mobile.png,reduced-motion.png,static.svg,static-export.png,static.png}`. The desktop/mobile screenshots and the static SVG/PNG were reviewed visually. The static-export screenshot shows a deliberately rotated/stretched test block, not the original demo layout. The check of the new schema only reads its real Editor; destructive alignment of existing boards was not needed.

ESLint on the new files and the Impeccable detector pass. The project-wide `npx tsc --noEmit` does not pass: there are errors in pre-existing parts (`agent-chat`, `spreadsheet-shape`, generator typing in `tldraw-lab`, `roomId` in useSync, Cloudflare globals, Vite config); there are no new errors in `live-diagram*`. This is not hidden as a successful project-wide typecheck.

Commit, push, deploy and external publishing were not performed.
