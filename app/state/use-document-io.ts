import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getSnapshot, loadSnapshot, parseTldrawJsonFile, serializeTldrawJsonBlob, type Editor } from "tldraw";
import { isDiagramSpec, type DiagramSpec } from "../domain/spec/types";
import { loadDiagramSpec } from "../domain/spec/load-graph";
import { parseDelimitedText } from "../io/csv";
import { downloadBlob } from "../io/download";
import { documentOnlySnapshot, pendingKey, revisionKey, safeSetLocalStorage, type WorkspaceDocument, type WorkspaceRevision } from "../io/workspace-storage";
import { createStatusRecovery, type SaveStatus } from "./save-status";
import type { PendingLoad } from "./use-editor-session";

type SnapshotInput = Parameters<typeof loadSnapshot>[1];
type Ref<T> = { current: T };
type ServerRevision = { at: string; file: string };
type StorageLike = Pick<Storage, "getItem" | "removeItem">;
export type DocumentIoOperationOptions = {
  currentId: string;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  setServerRevisions: (revisions: ServerRevision[]) => void;
  storage: StorageLike;
  revisionKey: (id: string) => string;
  pendingKey: (id: string) => string;
  pendingSnapshot: Ref<unknown>;
  pendingSpec: Ref<DiagramSpec | null>;
  pendingTitle: Ref<string>;
  status: SaveStatus;
};

// Revision lists and the pending-import handoff; storage, fetch and status are injected.
export function createDocumentIoOperations(options: Partial<DocumentIoOperationOptions>) {
  const o = options as DocumentIoOperationOptions;
  const { fetch } = o;

  const refreshServerRevisions = async (): Promise<ServerRevision[]> => {
    if (!o.currentId) {
      o.setServerRevisions([]);
      return [];
    }
    return o.status.recovery.async(
      "revision-list",
      async () => {
        const response = await fetch(`/api/lab/revisions?id=${encodeURIComponent(o.currentId)}`, { cache: "no-store" });
        const list = response.ok ? await response.json() : [];
        const next: ServerRevision[] = Array.isArray(list) ? list : [];
        o.setServerRevisions(next);
        return next;
      },
      [] as ServerRevision[],
      () => o.setServerRevisions([]),
    );
  };

  // Runs during render: the error is only captured here and published by a keyed effect.
  const readLocalRevisions = (): { revisions: WorkspaceRevision[]; error: string } => {
    if (!o.currentId) return { revisions: [], error: "" };
    let error = "";
    const revisions = createStatusRecovery((message) => {
      error = message;
    }).sync<WorkspaceRevision[]>("revision-local-read", () => JSON.parse(o.storage.getItem(o.revisionKey(o.currentId)) ?? "[]"), []);
    return { revisions, error };
  };

  const publishLocalRevisionError = (error: string) => {
    if (error) o.status.setSaved(error);
  };

  // One handoff: persisted record first, in-memory refs as fallback; every ref is cleared once consumed.
  const consumePending = (id: string): PendingLoad => {
    const persisted = o.status.recovery.sync("pending-import-read", () => JSON.parse(o.storage.getItem(o.pendingKey(id)) ?? "null"), null);
    o.storage.removeItem(o.pendingKey(id));
    const snapshot = persisted?.snapshot ?? o.pendingSnapshot.current;
    o.pendingSnapshot.current = null;
    const spec = persisted?.spec ?? o.pendingSpec.current;
    o.pendingSpec.current = null;
    const title = persisted?.title ?? o.pendingTitle.current;
    o.pendingTitle.current = "";
    return { snapshot, spec, title };
  };

  return { refreshServerRevisions, readLocalRevisions, publishLocalRevisionError, consumePending };
}

// Schedules one delayed seed attempt per document. The attempt mark sticks only once the timer fires,
// so a cleanup that cancels the timer before then (documents poll, StrictMode) leaves the attempt available.
export function scheduleSourceSeed(o: {
  attempted: Ref<string>;
  id: string;
  delay: number;
  run: () => void | Promise<void>;
  setTimer: (callback: () => void, delay: number) => unknown;
  clearTimer: (timer: unknown) => void;
}): (() => void) | undefined {
  if (o.attempted.current === o.id) return undefined;
  const timer = o.setTimer(() => {
    o.attempted.current = o.id;
    void o.run();
  }, o.delay);
  return () => o.clearTimer(timer);
}

export function useDocumentIo({
  workspace,
  editorRef,
  editorReady,
  status,
  addSpreadsheet,
}: {
  workspace: {
    currentId: string;
    current: WorkspaceDocument | undefined;
    documents: WorkspaceDocument[];
    createDocument: (title: string, prepare?: (document: WorkspaceDocument) => void) => void;
    updateCurrent: (patch: Partial<WorkspaceDocument>) => void;
  };
  editorRef: RefObject<Editor | null>;
  editorReady: boolean;
  status: SaveStatus;
  addSpreadsheet: (editor: Editor, input?: { title: string; rows: string[][] }) => unknown;
}) {
  const { currentId, current, documents } = workspace;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const spreadsheetFileRef = useRef<HTMLInputElement | null>(null);
  const pendingSnapshot = useRef<unknown>(null);
  const pendingSpec = useRef<DiagramSpec | null>(null);
  const pendingTitle = useRef("");
  const sourceSeedAttempted = useRef("");
  const [serverRevisions, setServerRevisions] = useState<ServerRevision[]>([]);
  // eslint-disable-next-line react-hooks/refs -- the refs are only stored by the factory and read inside handlers
  const operations = createDocumentIoOperations({
    currentId,
    fetch: (url, init) => fetch(url, init),
    setServerRevisions,
    storage: localStorage,
    revisionKey,
    pendingKey,
    pendingSnapshot,
    pendingSpec,
    pendingTitle,
    status,
  });

  const createDocument = (snapshot?: unknown, suggestedTitle = "New diagram") => {
    workspace.createDocument(suggestedTitle, (document) => {
      pendingSnapshot.current = snapshot ?? null;
      pendingTitle.current = suggestedTitle;
      if (snapshot || pendingSpec.current) safeSetLocalStorage(pendingKey(document.id), JSON.stringify({ snapshot, spec: pendingSpec.current, title: suggestedTitle }));
      pendingSpec.current = null;
    });
  };

  const renameCurrent = () => {
    if (!current) return;
    const title = window.prompt("Document title", current.title)?.trim();
    if (!title || title === current.title) return;
    workspace.updateCurrent({ title });
    const editor = editorRef.current;
    if (editor) editor.renamePage(editor.getCurrentPageId(), title);
  };

  const duplicateCurrent = () => {
    const editor = editorRef.current;
    if (!editor || !current) return;
    const title = window.prompt("Copy title", `${current.title} (copy)`)?.trim();
    if (!title) return;
    createDocument(documentOnlySnapshot(JSON.parse(JSON.stringify(getSnapshot(editor.store)))), title);
  };

  const exportSnapshot = () => {
    const editor = editorRef.current;
    if (!editor) return;
    downloadBlob(new Blob([JSON.stringify(getSnapshot(editor.store), null, 2)], { type: "application/json" }), `${current?.title ?? "tldraw"}.snapshot.json`);
  };

  const exportTldr = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    downloadBlob(await serializeTldrawJsonBlob(editor), `${current?.title ?? "tldraw"}.tldr`);
  };

  const exportImage = async (format: "png" | "svg") => {
    const editor = editorRef.current;
    if (!editor) return;
    const shapes = editor.getCurrentPageShapes();
    if (!shapes.length) {
      window.alert("Nothing to export on the canvas yet.");
      return;
    }
    try {
      if (format === "png") {
        const result = await editor.toImage(shapes, { format: "png", background: true, pixelRatio: 2 });
        downloadBlob(result.blob, `${current?.title ?? "tldraw"}.png`);
      } else {
        const result = await editor.getSvgString(shapes, { background: true });
        if (result) downloadBlob(new Blob([result.svg], { type: "image/svg+xml" }), `${current?.title ?? "tldraw"}.svg`);
      }
    } catch (error) {
      window.alert(`Export failed: ${String(error)}`);
    }
  };

  const importFile = async (file?: File) => {
    const editor = editorRef.current;
    if (!editor || !file) return;
    try {
      const text = await file.text();
      let snapshot: unknown;
      if (file.name.endsWith(".tldr")) {
        const result = parseTldrawJsonFile({ json: text, schema: editor.store.schema });
        if (!result.ok) throw new Error("Could not read the .tldr file");
        snapshot = documentOnlySnapshot(getSnapshot(result.value));
      } else {
        const payload = JSON.parse(text);
        if (isDiagramSpec(payload)) {
          const replace = window.confirm("Replace the contents of the current document?\n\nCancel will create a new document.");
          if (replace) {
            editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
            loadDiagramSpec(editor, payload);
          } else {
            pendingSpec.current = payload;
            createDocument(undefined, payload.title ?? file.name.replace(/\.[^.]+$/, ""));
          }
          return;
        }
        snapshot = documentOnlySnapshot(payload);
      }
      const replace = window.confirm("Replace the contents of the current document?\n\nCancel will create a safe copy.");
      if (replace) {
        loadSnapshot(editor.store, snapshot as SnapshotInput);
        editor.zoomToFit();
      } else createDocument(snapshot, file.name.replace(/\.(tldr|json)$/i, ""));
    } catch (error) {
      window.alert(`Failed to import file: ${String(error)}`);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const importSpreadsheet = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    const editor = editorRef.current;
    if (!file || !editor) return;
    const rows = parseDelimitedText(await file.text());
    if (!rows.length) window.alert("No tabular data found in the file.");
    else addSpreadsheet(editor, { title: file.name.replace(/\.(csv|tsv)$/i, ""), rows });
    input.value = "";
  };

  const restoreRevision = (revision: WorkspaceRevision) => {
    const editor = editorRef.current;
    if (!editor) return;
    loadSnapshot(editor.store, revision.snapshot as SnapshotInput);
    editor.zoomToFit();
  };
  const refreshServerRevisions = useCallback(() => {
    void operations.refreshServerRevisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- operations is rebuilt every render; only the document id changes it
  }, [currentId]);
  // Loads revisions from the server when the document changes; the synchronous setState only clears the list when no document is open.
  useEffect(() => {
    refreshServerRevisions();
  }, [refreshServerRevisions]);
  const restoreServerRevision = async (file: string) => {
    const editor = editorRef.current;
    if (!editor || !currentId) return;
    try {
      const response = await fetch(`/api/lab/revisions/${encodeURIComponent(currentId)}/${encodeURIComponent(file)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = parseTldrawJsonFile({ json: await response.text(), schema: editor.store.schema });
      if (!result.ok) throw new Error("Could not read the .tldr file");
      loadSnapshot(editor.store, documentOnlySnapshot(getSnapshot(result.value)) as Parameters<typeof loadSnapshot>[1]);
      editor.zoomToFit();
    } catch (error) {
      window.alert(`Failed to restore revision: ${String(error)}`);
    }
  };
  const localRevisionRead = operations.readLocalRevisions();
  useEffect(() => {
    operations.publishLocalRevisionError(localRevisionRead.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publishes only when the derived error string changes
  }, [localRevisionRead.error]);
  const revisions = localRevisionRead.revisions;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !editorReady) return;
    const diagramUrl = new URLSearchParams(window.location.search).get("diagram");
    if (!diagramUrl || diagramUrl.startsWith("blob:")) return;
    fetch(diagramUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload: unknown) => {
        if (!isDiagramSpec(payload)) throw new Error("Unsupported diagram format");
        editor.deleteShapes([...editor.getCurrentPageShapeIds()]);
        loadDiagramSpec(editor, payload);
      })
      .catch((error: unknown) => status.setSaved(`Error: ${String(error)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the ?diagram= spec loads once per editor readiness; status identity must not retrigger it
  }, [editorReady]);

  // A CLI-created document starts as a source spec and an empty realtime room.
  // Seed that room once, only while it is still empty. The second emptiness check
  // prevents a late collaborative hydration from being overwritten.
  useEffect(() => {
    const editor = editorRef.current;
    const sourceUrl = documents.find((document) => document.id === currentId)?.sourceUrl;
    if (!editorReady || !editor || !currentId || !sourceUrl) return;
    return scheduleSourceSeed({
      attempted: sourceSeedAttempted,
      id: currentId,
      delay: 2000,
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: (timer) => window.clearTimeout(timer as number),
      run: async () => {
        if (editor.getCurrentPageShapes().length) return;
        try {
          const response = await fetch(sourceUrl, { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload: unknown = await response.json();
          if (!isDiagramSpec(payload)) throw new Error("Unsupported diagram format");
          if (editor.getCurrentPageShapes().length) return;
          loadDiagramSpec(editor, payload);
          editor.zoomToFit();
        } catch (error) {
          status.setSaved(`sourceUrl load error: ${String(error)}`);
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the seed attempt is keyed by document id; operations and status identities must not retrigger it
  }, [currentId, documents, editorReady]);

  return {
    fileRef,
    spreadsheetFileRef,
    createDocument,
    renameCurrent,
    duplicateCurrent,
    importFile,
    importSpreadsheet,
    exportSnapshot,
    exportTldr,
    exportImage,
    restoreRevision,
    serverRevisions,
    revisions,
    refreshServerRevisions,
    restoreServerRevision,
    consumePending: (id: string) => operations.consumePending(id),
  };
}
