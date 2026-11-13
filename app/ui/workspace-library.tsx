"use client";

import { useMemo } from "react";
import { formatDate, useT, useUiLocale } from "../domain/i18n";
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
  const t = useT();
  const locale = useUiLocale();
  return (
    <section className="workspace-library" aria-label={t("library.aria")}>
      <header className="library-header">
        <div>
          <h1>{t("library.title")}</h1>
          <p>
            {t("library.intro")} <a href={documentPath(LIVE_DEMO_ID)}>{t("library.liveDemo")}</a>
          </p>
        </div>
        <button className="primary" onClick={() => createDocument()}>
          {t("library.newDiagram")}
        </button>
      </header>
      <div className="library-search">
        <input autoFocus placeholder={t("library.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <kbd>⌘ K</kbd>
      </div>
      <div className="document-grid">
        {filteredDocuments.map((document) => (
          <article className="document-card" key={document.id}>
            <button className="document-preview" aria-label={t("library.open", { title: document.title })} onClick={() => openDocument(document.id)}>
              {documentThumbnails[document.id] ? <img src={documentThumbnails[document.id]} alt="" /> : <span className="document-preview__pending">{t("library.previewPending")}</span>}
            </button>
            <div className="document-card__body">
              <button className="document-title" onClick={() => openDocument(document.id)}>
                {document.title}
              </button>
              <code>{document.id}</code>
              <p>{document.nextStep || t("library.noNextStep")}</p>
              <small>
                {document.project} · {formatDate(document.updatedAt, locale)}
              </small>
            </div>
            <button className="document-delete" aria-label={t("library.delete", { title: document.title })} onClick={() => deleteDocument(document.id)}>
              ×
            </button>
          </article>
        ))}
        {!filteredDocuments.length && (
          <div className="library-empty">
            <strong>{documents.length ? t("library.nothingFound") : t("library.empty")}</strong>
            <span>{t("library.emptyHint")}</span>
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
  const t = useT();
  const locale = useUiLocale();
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="workspace-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-heading">
          <strong>{t("drawer.title")}</strong>
          <button onClick={onClose}>×</button>
        </div>
        <input autoFocus placeholder={t("drawer.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="drawer-new" onClick={() => createDocument()}>
          {t("library.newDiagram")}
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
              {t("drawer.docTitle")}
              <input
                value={current.title}
                onChange={(event) => {
                  updateCurrent({ title: event.target.value });
                  renamePage(event.target.value);
                }}
              />
            </label>
            <label>
              {t("drawer.project")}
              <input value={current.project} onChange={(event) => updateCurrent({ project: event.target.value })} />
            </label>
            <label>
              {t("drawer.nextStep")}
              <textarea value={current.nextStep} onChange={(event) => updateCurrent({ nextStep: event.target.value })} />
            </label>
            <button onClick={() => navigator.clipboard.writeText(current.id)}>{t("drawer.copyId")}</button>
            <details
              onToggle={(event) => {
                if (event.currentTarget.open) refreshServerRevisions();
              }}
            >
              <summary>
                {t("drawer.history")} · {serverRevisions.length + revisions.length}
              </summary>
              {serverRevisions.slice(0, 8).map((revision) => (
                <button key={revision.file} onClick={() => void restoreServerRevision(revision.file)}>
                  {formatDate(revision.at, locale, true)}
                </button>
              ))}
              {revisions.slice(0, 8).map((revision) => (
                <button key={revision.at} onClick={() => restoreRevision(revision)}>
                  {formatDate(revision.at, locale, true)}
                </button>
              ))}
            </details>
          </div>
        )}
      </aside>
    </div>
  );
}
