import { useCallback, type RefObject } from "react";
import type { Editor, TLShapeId } from "tldraw";
import { isDiagramSpec } from "../domain/spec/types";
import { loadDiagramSpec } from "../domain/spec/load-graph";

// Graphite waves his wand at the spot first; resolves when the spell lands (or at once if he can't play).
function castSpell(editor: Editor, point: { x: number; y: number }) {
  return new Promise<void>((resolve) => {
    const screen = editor.pageToScreen(point);
    const detail = { x: screen.x, y: screen.y, done: resolve, accepted: false };
    window.dispatchEvent(new CustomEvent("pencil-buddy-cast", { detail }));
    if (detail.accepted) window.setTimeout(resolve, 5000);
    else resolve();
  });
}

// Generated pictures arrive huge; land them small (about 240 screen px on the long side) and let them grow in.
const GENERATED_IMAGE_SIDE = 240;
function shrinkNewImages(editor: Editor, before: Set<TLShapeId>, point: { x: number; y: number }) {
  const side = GENERATED_IMAGE_SIDE / editor.getZoomLevel();
  for (const shape of editor.getCurrentPageShapes()) {
    if (before.has(shape.id) || shape.type !== "image") continue;
    const { w, h } = shape.props as { w: number; h: number };
    const k = Math.min(1, side / Math.max(w, h)),
      fw = w * k,
      fh = h * k;
    editor.updateShape({ id: shape.id, type: "image", x: point.x - fw * 0.3, y: point.y - fh * 0.3, opacity: 0, props: { w: fw * 0.6, h: fh * 0.6 } });
    editor.animateShape({ id: shape.id, type: "image", x: point.x - fw / 2, y: point.y - fh / 2, opacity: 1, props: { w: fw, h: fh } }, { animation: { duration: 450 } });
  }
}

export async function applyPatchToEditor(editor: Editor | null, result: unknown) {
  if (!editor || !result || typeof result !== "object") return;
  const { patch, images = [] } = result as { patch?: unknown; images?: Array<{ name: string; url: string }> };
  if (isDiagramSpec(patch)) {
    const before = new Set(editor.getCurrentPageShapeIds());
    loadDiagramSpec(editor, patch);
    const appeared = editor.getCurrentPageShapes().filter((shape) => !before.has(shape.id));
    if (appeared.length) {
      editor.updateShapes(appeared.map((shape) => ({ id: shape.id, type: shape.type, opacity: 0 })));
      editor.animateShapes(
        appeared.map((shape) => ({ id: shape.id, type: shape.type, opacity: shape.opacity })),
        { animation: { duration: 900 } },
      );
    }
  }
  const center = editor.getViewportPageBounds().center;
  for (const [index, image] of images.entries()) {
    const response = await fetch(image.url);
    if (!response.ok) continue;
    const file = new File([await response.blob()], image.name, { type: response.headers.get("content-type") ?? "image/png" });
    const point = { x: center.x + index * 80, y: center.y + index * 60 };
    await castSpell(editor, point);
    const before = new Set(editor.getCurrentPageShapeIds()),
      camera = editor.getCamera();
    await editor.putExternalContent({ type: "files", files: [file], point });
    editor.setCamera(camera); // tldraw zooms out to fit a huge drop; keep the view the user had
    shrinkNewImages(editor, before, point);
  }
}

export function useAgentPatch(editorRef: RefObject<Editor | null>) {
  const getAgentEditor = useCallback(() => editorRef.current, [editorRef]);
  const applyAgentPatch = useCallback((result: unknown) => applyPatchToEditor(editorRef.current, result), [editorRef]);
  return { getAgentEditor, applyAgentPatch };
}
