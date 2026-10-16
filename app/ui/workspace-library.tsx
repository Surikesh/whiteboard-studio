"use client";

import { useMemo } from "react";
import { LIVE_DEMO_ID, documentPath, type WorkspaceDocument } from "../io/workspace-storage";
import type { useDocumentIo } from "../state/use-document-io";

type DocumentIo = ReturnType<typeof useDocumentIo>;

export function useFilteredDocuments(documents: WorkspaceDocument[], query: string) {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...documents]
      .filter((document) => !needle || [document.id, document.title, document.project, document.nextStep, ...document.tags].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [documents, query]);
}

export function WorkspaceLibrary({
  documents,
  filteredDocuments,
  documentThumbnails,
  query,
  setQuery,
  createDocument,
  openDocument,
  deleteDocument,
}: {
  documents: WorkspaceDocument[];
  filteredDocuments: WorkspaceDocument[];
  documentThumbnails: Record<string, string>;
  query: string;
  setQuery: (query: string) => void;
  createDocument: () => void;
  openDocument: (id: string) => void;
  deleteDocument: (id: string) => void;
}) {
  return (
    <section className="workspace-library" aria-label="Diagram library">
      <header className="library-header">
        <div>
          <h1>My diagrams</h1>
          <p>
            All boards at a glance. <a href={documentPath(LIVE_DEMO_ID)}>“Live diagram” demo</a>
          </p>
        </div>
        <button className="primary" onClick={() => createDocument()}>
          New diagram
        </button>
      </header>
      <div className="library-search">
        <input autoFocus placeholder="Search by title, ID, project or tag…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <kbd>⌘ K</kbd>
      </div>
      <div className="document-grid">
        {filteredDocuments.map((document) => (
          <article className="document-card" key={document.id}>
            <button className="document-preview" aria-label={`Open diagram “${document.title}”`} onClick={() => openDocument(document.id)}>
              {documentThumbnails[document.id] ? <img src={documentThumbnails[document.id]} alt="" /> : <span className="document-preview__pending">Preview appears after opening</span>}
            </button>
            <div className="document-card__body">
              <button className="document-title" onClick={() => openDocument(document.id)}>
                {document.title}
              </button>
              <code>{document.id}</code>
              <p>{document.nextStep || "Next step not recorded yet"}</p>
              <small>
                {document.project} · {new Date(document.updatedAt).toLocaleDateString("en-US")}
              </small>
            </div>
            <button className="document-delete" aria-label={`Delete ${document.title}`} onClick={() => deleteDocument(document.id)}>
              ×
            </button>
          </article>
        ))}
        {!filteredDocuments.length && (
          <div className="library-empty">
            <strong>{documents.length ? "Nothing found" : "Workspace is empty"}</strong>
            <span>Create your first diagram — it gets a permanent ID.</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function WorkspaceDrawer({
  current,
  currentId,
  filteredDocuments,
  query,
  setQuery,
  onClose,
  createDocument,
  openDocument,
  updateCurrent,
  renamePage,
  serverRevisions,
  revisions,
  refreshServerRevisions,
  restoreServerRevision,
  restoreRevision,
}: {
  current: WorkspaceDocument | undefined;
  currentId: string;
  filteredDocuments: WorkspaceDocument[];
  query: string;
  setQuery: (query: string) => void;
  onClose: () => void;
  createDocument: () => void;
  openDocument: (id: string) => void;
  updateCurrent: (patch: Partial<WorkspaceDocument>) => void;
  renamePage: (title: string) => void;
  serverRevisions: DocumentIo["serverRevisions"];
  revisions: DocumentIo["revisions"];
  refreshServerRevisions: DocumentIo["refreshServerRevisions"];
  restoreServerRevision: DocumentIo["restoreServerRevision"];
  restoreRevision: DocumentIo["restoreRevision"];
}) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="workspace-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-heading">
          <strong>Workspace</strong>
          <button onClick={onClose}>×</button>
        </div>
        <input autoFocus placeholder="Search diagrams…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="drawer-new" onClick={() => createDocument()}>
          New diagram
        </button>
        <div className="drawer-documents">
          {filteredDocuments.map((document) => (
            <button className={document.id === currentId ? "active" : ""} key={document.id} onClick={() => openDocument(document.id)}>
              <strong>{document.title}</strong>
              <small>{document.project}</small>
            </button>
          ))}
        </div>
        {current && (
          <div className="document-details">
            <label>
              Title
              <input
                value={current.title}
                onChange={(event) => {
                  updateCurrent({ title: event.target.value });
                  renamePage(event.target.value);
                }}
              />
            </label>
            <label>
              Project
              <input value={current.project} onChange={(event) => updateCurrent({ project: event.target.value })} />
            </label>
            <label>
              Where I left off
              <textarea value={current.nextStep} onChange={(event) => updateCurrent({ nextStep: event.target.value })} />
            </label>
            <button onClick={() => navigator.clipboard.writeText(current.id)}>Copy ID</button>
            <details
              onToggle={(event) => {
                if (event.currentTarget.open) refreshServerRevisions();
              }}
            >
              <summary>History · {serverRevisions.length + revisions.length}</summary>
              {serverRevisions.slice(0, 8).map((revision) => (
                <button key={revision.file} onClick={() => void restoreServerRevision(revision.file)}>
                  {new Date(revision.at).toLocaleString("en-US")}
                </button>
              ))}
              {revisions.slice(0, 8).map((revision) => (
                <button key={revision.at} onClick={() => restoreRevision(revision)}>
                  {new Date(revision.at).toLocaleString("en-US")}
                </button>
              ))}
            </details>
          </div>
        )}
      </aside>
    </div>
  );
}
