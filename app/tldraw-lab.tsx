"use client";

import { Tldraw, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";
import { useEffect, useState } from "react";
import { domainShapeUtils } from "./domain/shapes";
import { addServiceArchitecture } from "./domain/templates/service";
import { SpreadsheetShapeUtil, addSpreadsheet } from "./spreadsheet-shape";
import { useSaveStatus } from "./state/save-status";
import { useAgentPatch } from "./state/use-agent-patch";
import { useDocumentIo } from "./state/use-document-io";
import { useEditorSession } from "./state/use-editor-session";
import { useWorkspace } from "./state/use-workspace";
import { LiveFrameUtil, LiveControls, LivePlaybackContext, useLivePlayback, seedLiveDemo } from "./live-diagram";
import { AgentChat } from "./ui/agent-chat";
import { BoardSwitcherContext, type BoardSwitcherContextValue } from "./ui/board-switcher";
import { ComponentLibrary } from "./ui/component-library";
import { useMainMenu } from "./ui/main-menu";
import { WorkspaceDrawer, WorkspaceLibrary, useFilteredDocuments } from "./ui/workspace-library";

// Exported so the headless test harness (tests/helpers/headless-editor.mjs) builds editors from the exact production shape registry.
export const shapeUtils = [...domainShapeUtils, SpreadsheetShapeUtil, LiveFrameUtil];
export const collaborativeShapeUtils = [...defaultShapeUtils, ...shapeUtils];

export function TldrawLab({ initialDocumentId }: { initialDocumentId?: string } = {}) {
  const status = useSaveStatus();
  const { saved, setSaved } = status;
  const workspace = useWorkspace({ initialDocumentId, status });
  const { documents, currentId, current, documentThumbnails, setCurrentId, openDocument, updateCurrent, deleteDocument } = workspace;
  const session = useEditorSession({
    currentId,
    documents,
    touchDocument: workspace.touchDocument,
    setThumbnail: workspace.setThumbnail,
    status,
    collaborativeShapeUtils,
    seedLiveDemo,
  });
  const { editorReady, mountedEditor, collaborativeStore } = session;
  const io = useDocumentIo({ workspace, editorRef: session.editorRef, editorReady, status, addSpreadsheet });
  const { fileRef, spreadsheetFileRef, createDocument, serverRevisions, revisions, refreshServerRevisions } = io;
  const { getAgentEditor, applyAgentPatch } = useAgentPatch(session.editorRef);
  const [libraryOpen, setLibraryOpen] = useState(!initialDocumentId);
  const [componentLibraryOpen, setComponentLibraryOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [query, setQuery] = useState("");

  const filteredDocuments = useFilteredDocuments(documents, query);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLibraryOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "\\") {
        event.preventDefault();
        setFocusMode((value) => !value);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setSaved("Saved");
        window.setTimeout(() => setSaved(""), 1200);
      }
      if (event.key === "Escape") setLibraryOpen(false);
    };
    const onPopState = () => {
      const match = window.location.pathname.match(/^\/d\/([^/]+)$/);
      setCurrentId(match ? decodeURIComponent(match[1]) : "");
      setLibraryOpen(!match);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("popstate", onPopState);
    };
  }, [setSaved, setCurrentId]);

  const { uiOverrides, menuComponents } = useMainMenu({
    openWorkspace: () => setLibraryOpen(true),
    createDocument: () => createDocument(),
    renameCurrent: io.renameCurrent,
    duplicateCurrent: io.duplicateCurrent,
    importDocument: () => fileRef.current?.click(),
    exportTldr: io.exportTldr,
    exportImage: io.exportImage,
    exportSnapshot: io.exportSnapshot,
    copyLink: () => navigator.clipboard.writeText(window.location.href),
    copyId: () => navigator.clipboard.writeText(currentId),
    focus: () => setFocusMode(true),
    serviceTemplate: () => {
      const editor = session.editorRef.current;
      if (editor) addServiceArchitecture(editor);
    },
    spreadsheet: () => {
      const editor = session.editorRef.current;
      if (editor) addSpreadsheet(editor);
    },
    spreadsheetImport: () => spreadsheetFileRef.current?.click(),
  });
  const playback = useLivePlayback();

  const boardSwitcherContext: BoardSwitcherContextValue = {
    currentId,
    currentTitle: current?.title ?? "",
    documents,
    createDocument,
    importDocument: () => document.getElementById("workspace-file-input")?.click(),
    openDocument,
  };

  return (
    <main className="workspace-shell">
      {!currentId && (
        <WorkspaceLibrary
          documents={documents}
          filteredDocuments={filteredDocuments}
          documentThumbnails={documentThumbnails}
          query={query}
          setQuery={setQuery}
          createDocument={() => createDocument()}
          openDocument={openDocument}
          deleteDocument={deleteDocument}
        />
      )}

      {currentId && (
        <section className="canvas-wrap" aria-label="Interactive Tldraw canvas">
          <LivePlaybackContext.Provider value={playback.playing}>
            <BoardSwitcherContext.Provider value={boardSwitcherContext}>
              <Tldraw
                key={currentId}
                hideUi={focusMode}
                components={menuComponents}
                overrides={uiOverrides}
                store={collaborativeStore}
                shapeUtils={shapeUtils}
                onMount={(editor) => session.onMount(editor, () => io.consumePending(currentId))}
              />
            </BoardSwitcherContext.Provider>
          </LivePlaybackContext.Provider>
        </section>
      )}

      {currentId && !focusMode && (
        <>
          <button
            className={`component-library-trigger${componentLibraryOpen ? " is-open" : ""}`}
            aria-label="Open component library"
            title="Components"
            onClick={() => setComponentLibraryOpen((value) => !value)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M17.5 14v7M14 17.5h7" />
            </svg>
          </button>
          {editorReady && mountedEditor && <ComponentLibrary editor={mountedEditor} open={componentLibraryOpen} onClose={() => setComponentLibraryOpen(false)} />}
          {editorReady && mountedEditor && <LiveControls editor={mountedEditor} playback={playback} />}
          <AgentChat roomId={currentId} getEditor={getAgentEditor} applyPatch={applyAgentPatch} />
        </>
      )}

      <input id="workspace-file-input" ref={fileRef} type="file" accept=".tldr,.json,application/json" hidden onChange={(event) => io.importFile(event.target.files?.[0])} />
      <input ref={spreadsheetFileRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden onChange={(event) => io.importSpreadsheet(event.target)} />
      {saved && currentId && !focusMode && <div className={`native-save-status${saved.startsWith("Error") ? " is-error" : ""}`}>{saved}</div>}

      {libraryOpen && currentId && (
        <WorkspaceDrawer
          current={current}
          currentId={currentId}
          filteredDocuments={filteredDocuments}
          query={query}
          setQuery={setQuery}
          onClose={() => setLibraryOpen(false)}
          createDocument={() => createDocument()}
          openDocument={openDocument}
          updateCurrent={updateCurrent}
          renamePage={(title) => session.editorRef.current?.renamePage(session.editorRef.current.getCurrentPageId(), title)}
          serverRevisions={serverRevisions}
          revisions={revisions}
          refreshServerRevisions={refreshServerRevisions}
          restoreServerRevision={io.restoreServerRevision}
          restoreRevision={io.restoreRevision}
        />
      )}
    </main>
  );
}
