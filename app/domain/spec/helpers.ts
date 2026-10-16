import { type Editor, type TLShapePartial, renderPlaintextFromRichText } from "tldraw";
import { CLEAN_BOX_TYPE, SERVICE_TYPE } from "../shapes/types";
import { serviceCardHeight } from "../shapes/service-card";
import { editableTextBoxHeight } from "../shapes/text-height";

export function resizeGeneratedTextBoxes(editor: Editor) {
  const updates = editor.getCurrentPageShapes().flatMap<TLShapePartial>((shape) => {
    if (shape.type === SERVICE_TYPE) {
      const h = serviceCardHeight(shape.props.name, shape.props.w);
      return h !== shape.props.h ? [{ id: shape.id, type: shape.type, props: { h } } as const] : [];
    }
    if (shape.type === CLEAN_BOX_TYPE) {
      const h = editableTextBoxHeight(shape.props.label, shape.props.w, 120);
      return h !== shape.props.h ? [{ id: shape.id, type: shape.type, props: { h } } as const] : [];
    }
    if (!shape.id.startsWith("shape:spec-") || shape.type !== "geo" || !("richText" in shape.props)) return [];
    const label = renderPlaintextFromRichText(editor, shape.props.richText);
    // Blank geos are boundaries, not text boxes. Explicit compact heights from
    // the source spec are authoritative and must not be expanded to 120 px.
    if (!label.trim()) return [];
    const minimumHeight = Number((shape.meta as { diagramSpecMinimumHeight?: number }).diagramSpecMinimumHeight ?? shape.props.h);
    const h = editableTextBoxHeight(label, shape.props.w, minimumHeight);
    return h !== shape.props.h ? [{ id: shape.id, type: shape.type, props: { h } } as const] : [];
  });
  if (updates.length) editor.updateShapes(updates);
}

export function clearTransientCanvasOverlays(editor: Editor) {
  // This lab never renders snap guides. In Chromium with the macOS GPU canvas
  // backend, Tldraw's snap-indicator overlay can remain visible as full-height
  // dotted columns even after its interaction state has ended. Disable that
  // transient overlay at the renderer boundary; snapping itself still works.
  // The canvas grid is persisted in instance state. At low zoom Chromium
  // renders it as full-height dotted columns, which looks like a diagram
  // underlay. URL-loaded diagrams always start on a clean canvas.
  editor.updateInstanceState({ isGridMode: false });
  editor.snaps.clearIndicators();

  // A persisted editor session can retain Tldraw snap indicators after shapes
  // are replaced programmatically. They render as full-height dotted columns
  // even though they are not diagram shapes. Reset the interaction state and
  // clear the overlay both now and after zoom/load rendering has settled.
  // Transition through another root tool: setCurrentTool("select") alone is a
  // no-op when a persisted session is stuck in select.translating.
  editor.setCurrentTool("hand");
  editor.setCurrentTool("select");
  editor.selectNone();
  editor.snaps.clearIndicators();
  requestAnimationFrame(() => editor.snaps.clearIndicators());
  window.setTimeout(() => editor.snaps.clearIndicators(), 450);
}
