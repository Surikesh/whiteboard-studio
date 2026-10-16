"use client";

import { TldrawUiButton, TldrawUiButtonLabel, TldrawUiPopover, TldrawUiPopoverContent, TldrawUiPopoverTrigger } from "tldraw";
import { createContext, useContext, useState } from "react";
import type { WorkspaceDocument } from "../io/workspace-storage";

export type BoardSwitcherContextValue = {
  currentId: string;
  currentTitle: string;
  documents: WorkspaceDocument[];
  createDocument: () => void;
  importDocument: () => void;
  openDocument: (id: string) => void;
};

export const BoardSwitcherContext = createContext<BoardSwitcherContextValue | null>(null);

export function WorkspaceBoardSwitcher() {
  const workspace = useContext(BoardSwitcherContext);
  const [query, setQuery] = useState("");
  if (!workspace) return null;
  const needle = query.trim().toLowerCase();
  const documents = [...workspace.documents]
    .filter((document) => !needle || [document.id, document.title, document.project, document.nextStep, ...document.tags].join(" ").toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <TldrawUiPopover id="workspace-board-switcher">
      <TldrawUiPopoverTrigger>
        <TldrawUiButton type="normal" className="board-switcher-trigger" title="Switch board">
          <span className="board-switcher-icon" aria-hidden="true">
            ▦
          </span>
          <TldrawUiButtonLabel>{workspace.currentTitle || "My boards"}</TldrawUiButtonLabel>
          <span className="board-switcher-chevron" aria-hidden="true">
            ⌄
          </span>
        </TldrawUiButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent side="bottom" align="start" sideOffset={6} collisionPadding={8}>
        <div className="board-switcher-popover">
          <div className="board-switcher-header">
            <strong>My boards</strong>
            <span>{workspace.documents.length}</span>
          </div>
          <input aria-label="Search boards" placeholder="Find a board or project…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="board-switcher-list">
            {documents.map((document) => (
              <button className={document.id === workspace.currentId ? "active" : ""} key={document.id} onClick={() => workspace.openDocument(document.id)}>
                <span className="board-switcher-thumb">{document.title.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{document.title}</strong>
                  <small>
                    {document.project} · {new Date(document.updatedAt).toLocaleDateString("en-US")}
                  </small>
                </span>
                {document.id === workspace.currentId && <i aria-label="Open">✓</i>}
              </button>
            ))}
            {!documents.length && <p>No boards found</p>}
          </div>
          <div className="board-switcher-actions">
            <button onClick={() => workspace.createDocument()}>＋ New board</button>
            <button onClick={workspace.importDocument}>Import…</button>
          </div>
        </div>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  );
}
