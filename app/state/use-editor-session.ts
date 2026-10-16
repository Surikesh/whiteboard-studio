import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { defaultBindingUtils, loadSnapshot, type Editor, type TLAnyShapeUtilConstructor } from "tldraw";
import { useSync } from "@tldraw/sync";
import { loadDiagramSpec } from "../domain/spec/load-graph";
import type { DiagramSpec } from "../domain/spec/types";
import { resizeGeneratedTextBoxes, clearTransientCanvasOverlays } from "../domain/spec/helpers";
import { inlineAssetStore } from "../io/inline-asset-store";
import { captureDocumentThumbnail } from "../io/thumbnails";
import { LIVE_DEMO_ID, type WorkspaceDocument } from "../io/workspace-storage";
import type { SaveStatus } from "./save-status";

type Timer = ReturnType<typeof setTimeout>;
type SnapshotInput = Parameters<typeof loadSnapshot>[1];
export type PendingLoad = { snapshot: unknown; spec: DiagramSpec | null; title: string };
export type EditorSessionOperationOptions = {
  editor: Editor;
  currentId: string;
  thumbnailTimer: MutableRefObject<Timer | null | undefined>;
  revisionTimer: MutableRefObject<Timer | null | undefined>;
  setTimeout: (callback: () => void, delay: number) => Timer;
  clearTimeout: (timer: Timer) => void;
  resizeGeneratedTextBoxes: (editor: Editor) => void;
  clearTransientCanvasOverlays: (editor: Editor) => void;
  captureDocumentThumbnail: (editor: Editor, id: string) => Promise<string | null | undefined>;
  setThumbnail: (id: string, src: string) => void;
  touchDocument: (id: string, at: string) => void;
  status: SaveStatus;
};

// Initial fit and the user-change debounces of a mounted editor; timers, capture and status are injected.
export function createEditorSessionOperations(options: Partial<EditorSessionOperationOptions>) {
  const o = options as EditorSessionOperationOptions;
  const { setTimeout, clearTimeout } = o;
  const captureThumbnail = (site: string) =>
    o.status.recovery.async(
      site,
      () =>
        o.captureDocumentThumbnail(o.editor, o.currentId).then((src) => {
          if (src) o.setThumbnail(o.currentId, src);
        }),
      undefined,
    );

  // Realtime documents can hydrate after onMount. Fit once, as soon as their
  // first shapes arrive, so opening a board starts with an overview rather
  // than an arbitrary 100% crop. Subsequent user camera choices are untouched.
  const startInitialFit = () => {
    let fitAttempts = 0;
    let initialFitTimer: Timer | undefined;
    const fitInitialBoard = () => {
      if (o.editor.getCurrentPageShapes().length) {
        o.resizeGeneratedTextBoxes(o.editor);
        o.editor.zoomToFit({ animation: { duration: 280 } });
        o.clearTransientCanvasOverlays(o.editor);
        void captureThumbnail("thumbnail-initial-fit");
        return;
      }
      if (fitAttempts++ < 40) initialFitTimer = setTimeout(fitInitialBoard, 100);
    };
    initialFitTimer = setTimeout(fitInitialBoard, 100);
    return () => {
      if (initialFitTimer) clearTimeout(initialFitTimer);
    };
  };

  const onUserChange = () => {
    o.status.setSaved("Saving…");
    if (o.thumbnailTimer.current) clearTimeout(o.thumbnailTimer.current);
    o.thumbnailTimer.current = setTimeout(() => {
      void captureThumbnail("thumbnail-user-change");
    }, 1200);
    if (o.revisionTimer.current) clearTimeout(o.revisionTimer.current);
    o.revisionTimer.current = setTimeout(() => {
      // Revisions are written on disk by the dev server (lab-storage-plugin).
      o.touchDocument(o.currentId, new Date().toISOString());
      o.status.setSaved("Saved");
      setTimeout(() => o.status.setSaved(""), 1200);
    }, 900);
  };

  return { startInitialFit, onUserChange };
}

export function useEditorSession({
  currentId,
  documents,
  touchDocument,
  setThumbnail,
  status,
  collaborativeShapeUtils,
  seedLiveDemo,
}: {
  currentId: string;
  documents: WorkspaceDocument[];
  touchDocument: (id: string, at: string) => void;
  setThumbnail: (id: string, src: string) => void;
  status: SaveStatus;
  collaborativeShapeUtils: readonly TLAnyShapeUtilConstructor[];
  seedLiveDemo: (editor: Editor) => void;
}) {
  const editorRef = useRef<Editor | null>(null);
  const revisionTimer = useRef<Timer | null>(null);
  const thumbnailTimer = useRef<Timer | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [mountedEditor, setMountedEditor] = useState<Editor | null>(null);
  const syncRoomId = currentId || "workspace-lobby";
  const syncUri = useMemo(() => `${window.location.origin}/api/connect/${encodeURIComponent(syncRoomId)}`, [syncRoomId]);
  const collaborativeStore = useSync({
    uri: syncUri,
    shapeUtils: collaborativeShapeUtils as TLAnyShapeUtilConstructor[],
    bindingUtils: defaultBindingUtils,
    assets: inlineAssetStore,
  });

  const onMount = (editor: Editor, consumePending: () => PendingLoad) => {
    editorRef.current = editor;
    setMountedEditor(editor);
    clearTransientCanvasOverlays(editor);
    // Kept deliberately: the documented layout preflight (scripts/workspace-layout.mjs, scripts/verify-live-diagram.mjs) drives the
    // authoritative realtime editor through this global rather than the stale source spec; tests/rendered-html.test.mjs pins it.
    (window as unknown as { __tldrawEditor?: Editor }).__tldrawEditor = editor;
    const { snapshot: snapshotToLoad, spec: specToLoad, title: createdTitle } = consumePending();
    if (currentId === LIVE_DEMO_ID) seedLiveDemo(editor);
    const title = createdTitle || documents.find((document) => document.id === currentId)?.title;
    window.setTimeout(() => {
      if (snapshotToLoad) {
        loadSnapshot(editor.store, snapshotToLoad as SnapshotInput);
        editor.zoomToFit();
      }
      if (specToLoad) loadDiagramSpec(editor, specToLoad);
      if (title && (createdTitle || editor.getCurrentPage().name === "Page 1")) editor.renamePage(editor.getCurrentPageId(), title);
    }, 150);
    setEditorReady(true);
    const operations = createEditorSessionOperations({
      editor,
      currentId,
      thumbnailTimer,
      revisionTimer,
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (timer) => clearTimeout(timer),
      resizeGeneratedTextBoxes,
      clearTransientCanvasOverlays,
      captureDocumentThumbnail,
      setThumbnail,
      touchDocument,
      status,
    });
    const stopFit = operations.startInitialFit();
    const unsubscribe = editor.store.listen(
      () => {
        operations.onUserChange();
      },
      { scope: "document", source: "user" },
    );
    return () => {
      stopFit();
      if (thumbnailTimer.current) window.clearTimeout(thumbnailTimer.current);
      unsubscribe();
    };
  };

  return { editorRef, editorReady, mountedEditor, collaborativeStore, onMount };
}
