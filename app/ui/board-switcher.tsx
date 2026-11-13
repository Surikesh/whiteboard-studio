"use client";

import { TldrawUiButton, TldrawUiButtonLabel, TldrawUiPopover, TldrawUiPopoverContent, TldrawUiPopoverTrigger } from "tldraw";
import { createContext, useContext, useState } from "react";
import type { WorkspaceDocument } from "../io/workspace-storage";
import { formatDate, useT, useUiLocale } from "../domain/i18n";

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
  const t = useT();
  const locale = useUiLocale();
  if (!workspace) return null;
  const needle = query.trim().toLowerCase();
  const documents = [...workspace.documents]
    .filter((document) => !needle || [document.id, document.title, document.project, document.nextStep, ...document.tags].join(" ").toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <TldrawUiPopover id="workspace-board-switcher">
      <TldrawUiPopoverTrigger>
        <TldrawUiButton type="normal" className="board-switcher-trigger" title={t("switcher.trigger")}>
          <span className="board-switcher-icon" aria-hidden="true">
            ▦
          </span>
          <TldrawUiButtonLabel>{workspace.currentTitle || t("switcher.title")}</TldrawUiButtonLabel>
          <span className="board-switcher-chevron" aria-hidden="true">
            ⌄
          </span>
        </TldrawUiButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent side="bottom" align="start" sideOffset={6} collisionPadding={8}>
        <div className="board-switcher-popover">
          <div className="board-switcher-header">
            <strong>{t("switcher.title")}</strong>
            <span>{workspace.documents.length}</span>
          </div>
          <input aria-label={t("switcher.searchAria")} placeholder={t("switcher.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="board-switcher-list">
            {documents.map((document) => (
              <button className={document.id === workspace.currentId ? "active" : ""} key={document.id} onClick={() => workspace.openDocument(document.id)}>
                <span className="board-switcher-thumb">{document.title.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{document.title}</strong>
                  <small>
                    {document.project} · {formatDate(document.updatedAt, locale)}
                  </small>
                </span>
                {document.id === workspace.currentId && <i aria-label={t("switcher.current")}>✓</i>}
              </button>
            ))}
            {!documents.length && <p>{t("switcher.none")}</p>}
          </div>
          <div className="board-switcher-actions">
            <button onClick={() => workspace.createDocument()}>{t("switcher.new")}</button>
            <button onClick={workspace.importDocument}>{t("switcher.import")}</button>
          </div>
        </div>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  );
}
