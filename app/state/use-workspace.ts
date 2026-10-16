import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  LIVE_DEMO_ID,
  createDocumentPusher,
  deleteSharedDocument,
  documentPath,
  mergeWorkspaceDocuments,
  newDocument,
  pushCommittedDocuments,
  readDocuments,
  retrieveWorkspaceSources,
  revisionKey,
  syncSharedDocument,
  writeDocuments,
  type WorkspaceDocument,
} from "../io/workspace-storage";
import { readThumbnails } from "../io/thumbnails";
import type { SaveStatus } from "./save-status";

type Sources = Awaited<ReturnType<typeof retrieveWorkspaceSources>>;
type DocumentsUpdate = WorkspaceDocument[] | ((current: WorkspaceDocument[]) => WorkspaceDocument[]);
export type WorkspaceOperationOptions = {
  currentId: string;
  remoteUpdatedAt: Map<string, string>;
  reconcileComplete: MutableRefObject<boolean>;
  readDocuments: () => WorkspaceDocument[];
  getDocuments: () => WorkspaceDocument[];
  setDocuments: (update: DocumentsUpdate) => void;
  writeDocuments: (documents: WorkspaceDocument[]) => void;
  newDocument: (title?: string) => WorkspaceDocument;
  retrieveSources: () => Promise<Sources>;
  readThumbnails: (ids: string[]) => Promise<Record<string, string>>;
  setThumbnails: (thumbnails: Record<string, string>) => void;
  isCancelled: () => boolean;
  pushDocument: (document: WorkspaceDocument) => Promise<void>;
  navigate: (id: string) => void;
  status: SaveStatus;
};

// Index polling, thumbnail reads and board creation; every dependency is injected so the hook and tests share this code.
export function createWorkspaceOperations(options: Partial<WorkspaceOperationOptions>) {
  const o = options as WorkspaceOperationOptions;
  const { recovery } = o.status;
  const persistDocuments = (next: WorkspaceDocument[]) => {
    o.setDocuments(next);
    o.writeDocuments(next);
  };

  const pollWorkspace = (): Promise<void> =>
    recovery.async(
      "workspace-poll",
      () =>
        o.retrieveSources().then(({ agentResult, sharedResult, complete }) => {
          const agentDocuments = agentResult ?? [];
          const sharedDocuments = sharedResult ?? [];
          o.reconcileComplete.current = complete;
          if (complete) {
            o.remoteUpdatedAt.clear();
            for (const document of [...agentDocuments, ...sharedDocuments]) o.remoteUpdatedAt.set(document.id, document.updatedAt);
          }
          o.setDocuments((currentDocuments) => {
            const browserDocuments = currentDocuments.length ? currentDocuments : o.readDocuments();
            const merged = mergeWorkspaceDocuments(agentDocuments, sharedDocuments, browserDocuments, o.currentId);
            o.writeDocuments(merged);
            return merged;
          });
        }),
      undefined,
      () => {
        o.reconcileComplete.current = false;
        o.setDocuments((currentDocuments) => {
          const next = currentDocuments.length ? currentDocuments : o.readDocuments();
          if (!o.currentId || next.some((document) => document.id === o.currentId)) return next;
          const merged = [{ ...o.newDocument(o.currentId === LIVE_DEMO_ID ? "Live diagram · User → Agent → Service → Response" : "Untitled"), id: o.currentId }, ...next];
          o.writeDocuments(merged);
          return merged;
        });
      },
    );

  const loadThumbnails = (): Promise<void> =>
    recovery.async(
      "thumbnail-read",
      () =>
        o.readThumbnails(o.getDocuments().map((document) => document.id)).then((loaded) => {
          if (!o.isCancelled()) o.setThumbnails(loaded);
        }),
      undefined,
    );

  // Metadata, prepare and persistence stay synchronous; only the PUT continuation is a promise.
  const createDocument = (title: string, prepare?: (document: WorkspaceDocument) => void): Promise<void> => {
    const document = o.newDocument(title);
    prepare?.(document);
    persistDocuments([document, ...o.getDocuments()]);
    return recovery.async("document-create", () => o.pushDocument(document), undefined).finally(() => o.navigate(document.id));
  };

  return { pollWorkspace, loadThumbnails, createDocument };
}

export function useWorkspace({ initialDocumentId, status }: { initialDocumentId?: string; status: SaveStatus }) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  // Server-side updatedAt per document, replaced from every fetch and advanced only after a successful PUT.
  const [remoteUpdatedAt] = useState(() => new Map<string, string>());
  // At most one PUT per document is in flight; the version being sent is recorded here.
  const [putsInFlight] = useState(() => new Map<string, string>());
  const documentsRef = useRef<WorkspaceDocument[]>([]);
  // Automatic reconciliation PUTs run only after a poll that retrieved every source successfully.
  const reconcileComplete = useRef(false);
  // All dedupe state lives in the two maps, so building the pusher per call is equivalent to a persistent one.
  const pushDocument = (document: WorkspaceDocument): Promise<void> =>
    createDocumentPusher({
      remoteUpdatedAt,
      putsInFlight,
      getDocuments: () => documentsRef.current,
      send: syncSharedDocument,
    })(document);
  const [documentThumbnails, setDocumentThumbnails] = useState<Record<string, string>>({});
  const [currentId, setCurrentId] = useState(initialDocumentId ?? "");
  const current = documents.find((document) => document.id === currentId);

  const operations = (extra: Partial<WorkspaceOperationOptions>) =>
    createWorkspaceOperations({
      currentId,
      remoteUpdatedAt,
      reconcileComplete,
      getDocuments: () => documents,
      setDocuments,
      writeDocuments,
      newDocument,
      readThumbnails,
      setThumbnails: setDocumentThumbnails,
      isCancelled: () => false,
      pushDocument,
      navigate: (id) => window.location.assign(documentPath(id)),
      status,
      ...extra,
    });

  // Native shell tabs and browser tabs are labelled by the page title.
  const currentTitle = current?.title;
  useEffect(() => {
    document.title = currentTitle ? `${currentTitle} · Tldraw Lab` : currentId ? "Tldraw Lab" : "Library · Tldraw Lab";
  }, [currentTitle, currentId]);

  useEffect(() => {
    const local = readDocuments();
    const index = operations({ readDocuments: () => local, retrieveSources: () => retrieveWorkspaceSources(fetch) });
    void index.pollWorkspace();
    const interval = window.setInterval(() => {
      void index.pollWorkspace();
    }, 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- operations is rebuilt every render; the poll must restart only when the document or its remote timestamp changes
  }, [currentId, remoteUpdatedAt]);

  // PUTs run from committed state only (never inside a state updater); the ref map dedupes versions.
  useEffect(() => {
    documentsRef.current = documents;
    pushCommittedDocuments(documents, reconcileComplete.current, pushDocument);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- operations is rebuilt every render; the push must run only when committed documents change
  }, [documents]);

  useEffect(() => {
    let cancelled = false;
    void operations({ isCancelled: () => cancelled }).loadThumbnails();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- operations is rebuilt every render; thumbnails reload only when committed documents change
  }, [documents]);

  const persistDocuments = (next: WorkspaceDocument[]) => {
    setDocuments(next);
    writeDocuments(next);
  };

  const createDocument = (title: string, prepare?: (document: WorkspaceDocument) => void) => {
    void operations({}).createDocument(title, prepare);
  };

  const openDocument = (id: string) => {
    window.location.assign(documentPath(id));
  };

  const updateCurrent = (patch: Partial<WorkspaceDocument>) => {
    if (!currentId) return;
    let changed: WorkspaceDocument | undefined;
    const next = documents.map((document) => {
      if (document.id !== currentId) return document;
      changed = { ...document, ...patch, updatedAt: new Date().toISOString() };
      return changed;
    });
    persistDocuments(next);
    if (changed) void pushDocument(changed).catch((error) => status.setSaved(`List sync error: ${String(error)}`));
  };

  const deleteDocument = (id: string) => {
    if (!window.confirm("Delete the document from the local workspace?")) return;
    persistDocuments(documents.filter((document) => document.id !== id));
    void deleteSharedDocument(id).catch((error) => status.setSaved(`Error deleting from shared list: ${String(error)}`));
    localStorage.removeItem(revisionKey(id));
    if (id === currentId) window.location.assign("/");
  };

  const touchDocument = (id: string, at: string) => {
    setDocuments((items) => {
      const next = items.map((item) => (item.id === id ? { ...item, updatedAt: at } : item));
      writeDocuments(next);
      return next;
    });
  };

  const setThumbnail = (id: string, src: string) => setDocumentThumbnails((items) => ({ ...items, [id]: src }));

  return {
    documents,
    currentId,
    current,
    currentTitle,
    documentThumbnails,
    setCurrentId,
    createDocument,
    openDocument,
    updateCurrent,
    deleteDocument,
    touchDocument,
    setThumbnail,
  };
}
